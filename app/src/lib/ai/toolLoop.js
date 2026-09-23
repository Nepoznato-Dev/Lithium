import { liChatStream } from '../backendApi';
import { createToolCallAccumulator } from './sse';
import {
  buildSkillRegistry, toToolDefinitions, idToToolName, resolveSkillId, MODEL_EXTENSION_CALLER,
} from './skillRegistry';
import { askPermission, isAutoApprove, isOffered } from './skillPermissions';
import { call as apiCall } from './apiManager';
import { runRecipe, getRecipe } from './skillRecipes';
import { checkGrant, grantApiAccess, invokeExtensionApi } from '../extensions/extSecurity';

/**
 * Tool-calling loop.
 *
 * Replaces the single `streamChatCompletion` call when the active provider
 * supports function calling and at least one skill is offered. The loop:
 *
 *   1. Builds the OpenAI-format tools array from the skill registry, filtering
 *      out skills the user has blocked.
 *   2. Streams a completion to the model with those tools attached.
 *   3. If the model emitted `tool_calls`:
 *        a. For each call, resolves the permission gate.
 *        b. If 'ask': awaits the PermissionDialog (via `askPermission()`).
 *        c. Executes the call through `apiManager.call(…, 'model')`.
 *        d. Appends the assistant message and tool-result messages to the
 *           running conversation, then loops back to step 2.
 *   4. Returns the accumulated text once the model stops calling tools.
 *
 * Tool names in the API exchange use underscores (e.g. `fs_read`) because the
 * OpenAI function-name spec disallows dots. `resolveSkillId` maps a name back to
 * the registry's dotted skill-id — including the multi-dot ids that extensions
 * contribute — before anything is executed.
 *
 * MAX_TOOL_ROUNDS caps the loop so a confused model cannot burn credits
 * indefinitely. The signal is forwarded to every iteration so Stop cancels
 * the whole conversation, not just one turn.
 */

const MAX_TOOL_ROUNDS = 10;

/**
 * Run an extension-provided API on the model's behalf.
 *
 * This is the same cross-boundary path a .li app uses, so the result is
 * sanitized and the extension's own rules apply. The skill dialog has just put
 * this exact call in front of the user, so the outcome is written down as the
 * model caller's grant rather than asking twice.
 */
async function callExtensionApi(skill, args) {
  if (!checkGrant(MODEL_EXTENSION_CALLER, skill.extId, skill.handler)) {
    grantApiAccess(MODEL_EXTENSION_CALLER, skill.extId, [skill.handler]);
  }
  const verdict = await invokeExtensionApi({
    appId: MODEL_EXTENSION_CALLER,
    extId: skill.extId,
    method: skill.handler,
    params: args,
  });
  if (!verdict.ok) throw new Error(verdict.error);
  return verdict.result;
}

/**
 * Run the full tool-calling loop for one user message.
 *
 * @param {Object} options
 * @param {Array}  options.messages  — full conversation (system + history + current user msg)
 * @param {string} [options.model]   — model override
 * @param {AbortSignal} [options.signal]
 * @param {Function} [options.onToken]     — text delta callback (chunk, fullTextThisRound)
 * @param {Function} [options.onReasoning] — reasoning delta callback
 * @param {Function} [options.onUsage]     — credit receipt callback
 * @returns {Promise<string>} accumulated assistant text across all rounds
 */
export async function runToolLoop({ messages, model, signal, onToken, onReasoning, onUsage, thinkingBudget }) {
  // Build the skill registry and the offered tool definitions once per call.
  const registry = buildSkillRegistry();
  const toolDefs = toToolDefinitions(
    registry,
    id => isOffered(id, registry.get(id)?.permission),
    idToToolName,
  );

  // Work on a mutable copy so the caller's array is not mutated.
  const runMessages = [...messages];

  let cumulativeText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const accumulator = createToolCallAccumulator();

    // Wrap onToken so the UI always sees the cumulative text from all rounds,
    // not just the current round's local `full` value.
    const roundOnToken = onToken
      ? (chunk, roundFull) => onToken(chunk, cumulativeText + roundFull)
      : undefined;

    const roundText = await liChatStream(runMessages, {
      model,
      signal,
      onToken: roundOnToken,
      onReasoning,
      onUsage,
      tools: toolDefs.length ? toolDefs : undefined,
      toolAccumulator: accumulator,
      thinkingBudget,
    });

    cumulativeText += (round > 0 && roundText ? '\n\n' : '') + roundText;

    // No tool calls — the model finished normally.
    if (!accumulator.hasCalls) break;

    // Append the assistant message that contained the tool calls.
    // OpenAI expects content: null when there are only tool calls.
    runMessages.push({
      role: 'assistant',
      content: roundText || null,
      tool_calls: accumulator.calls.map(c => ({
        id: c.id,
        type: 'function',
        function: { name: c.function.name, arguments: c.function.arguments },
      })),
    });

    // Execute each tool call and collect its result.
    for (const call of accumulator.calls) {
      const skillId = resolveSkillId(registry, call.function.name);
      const skill = skillId ? registry.get(skillId) : null;
      const builtinPermission = skill?.permission || 'ask';

      let args = {};
      try { args = JSON.parse(call.function.arguments); } catch { /* malformed JSON — will fail at call time */ }

      let resultStr;
      if (!skill) {
        // The model invented a name. Say so, rather than pretending it ran.
        resultStr = JSON.stringify({ error: `no such skill '${call.function.name}'` });
      } else {
        // Permission gate
        let approved = false;
        if (isAutoApprove(skillId, builtinPermission)) {
          approved = true;
        } else if (builtinPermission !== 'block') {
          approved = await askPermission(skillId, skill.name || skillId, skill.description || '', args);
        }
        // If builtinPermission === 'block', approved stays false.

        if (approved) {
          try {
            const raw = skill.recipe
              ? (await runRecipe(getRecipe(skillId), args)).finalResult
              : skill.extId
                ? await callExtensionApi(skill, args)
                : await apiCall(skillId, args, 'model');
            resultStr = JSON.stringify(raw ?? null);
          } catch (err) {
            resultStr = JSON.stringify({ error: err.message });
          }
        } else {
          resultStr = JSON.stringify({ denied: true, reason: 'User denied the skill request.' });
        }
      }

      runMessages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: resultStr,
      });
    }
    // Loop continues — the model now has the tool results and can answer.
  }

  return cumulativeText;
}
