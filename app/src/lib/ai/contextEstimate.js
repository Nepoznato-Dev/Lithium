import { maxContextForModel } from './providers';

/**
 * Client-side context window estimator.
 *
 * Gives the send-button ring a live "how full is this conversation" number
 * without waiting for the server's receipt. Uses the same chars/4 heuristic the
 * server meter falls back to when the upstream reports no usage, plus per-message
 * overhead for chat-template tokens (role markers, newlines).
 */

/** Rough token estimate from character count — matches server/src/routes/chat.rs. */
function charsToTokens(chars) {
  return Math.ceil(chars / 4);
}

/** Per-message overhead for role and turn markers in a chat template. */
const MSG_OVERHEAD_TOKENS = 4;

/**
 * What one picture costs the context window.
 *
 * Deliberately flat: base64 bytes are not tokens, and a provider tiles an image
 * into the high hundreds of tokens whether the model looks at it or only reads
 * the caption written in its place.
 */
const IMAGE_TOKENS = 800;

/** Token cost of the attachments staged in the composer but not yet sent. */
function attachmentTokens(attachments) {
  let total = 0;
  for (const att of attachments || []) {
    if (att.type === 'image') { total += IMAGE_TOKENS; continue; }
    total += charsToTokens(`[Attached: ${att.name}]\n${att.content}`.length) + MSG_OVERHEAD_TOKENS;
  }
  return total;
}

/**
 * Estimate how many context tokens the current conversation occupies.
 *
 * @param {Array<{role: string, content: string}>} messages - session messages
 * @param {string} systemPrompt - the active system prompt (including knowledge injection)
 * @param {string} modelId - the selected model id (to resolve its context limit)
 * @param {Object} [options]
 * @param {Array} [options.attachments] - files staged in the composer; they ride on
 *   the next turn, so the ring has to show them before the message is sent
 * @returns {{ used: number, limit: number, ratio: number }}
 */
export function estimateContextTokens(messages, systemPrompt, modelId, { attachments } = {}) {
  const limit = maxContextForModel(modelId);

  let total = 0;

  // System prompt occupies context on every request
  if (systemPrompt) {
    total += charsToTokens(systemPrompt.length) + MSG_OVERHEAD_TOKENS;
  }

  // Conversation history
  for (const msg of messages) {
    const content = msg.content || '';
    const contextText = msg.context?.text || '';
    const chars = content.length + contextText.length;
    total += charsToTokens(chars) + MSG_OVERHEAD_TOKENS;
  }

  // Staged attachments — sent once, then counted as part of the message above.
  total += attachmentTokens(attachments);

  // Reserve for the response the model is about to generate (conservative)
  const responseReserve = Math.min(2048, Math.round(limit * 0.05));
  const used = total + responseReserve;

  return {
    used: total,
    withReserve: used,
    limit,
    ratio: Math.min(1, total / limit),
    /** Whether the conversation is getting tight (over 85%) */
    shouldCompact: total / limit > 0.85,
  };
}

/**
 * Quick estimate for a single draft message — used by the pre-send tooltip to
 * show how much the upcoming turn adds.
 */
export function estimateDraftTokens(text) {
  return charsToTokens((text || '').length) + MSG_OVERHEAD_TOKENS;
}
