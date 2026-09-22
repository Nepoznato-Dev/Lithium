/**
 * Auto-compaction.
 *
 * A conversation that no longer fits the model's window is folded into a
 * paragraph: the oldest turns are summarized and replaced by one system message,
 * while the last couple of exchanges stay verbatim so the next reply can still
 * read the immediate context.
 *
 * It runs *before* the turn that would not fit, not after it — a thread that
 * overflowed has already been answered from the truncated end, which is the
 * failure worth avoiding rather than a thing to clean up afterwards.
 */

/** Messages kept word-for-word at the end of the thread (two full exchanges). */
const KEEP_MESSAGES = 4;

/** Per-message ceiling in the summarizer's own prompt. */
const MESSAGE_CAP = 1500;

/** Whole-transcript ceiling. The newest material is what survives the cut. */
const TRANSCRIPT_CAP = 24_000;

/** Longest summary accepted, in output tokens. */
const SUMMARY_TOKENS = 500;

const SUMMARIZER_PROMPT = [
  'You compress conversations so another run of the same model can carry on.',
  'Write one dense paragraph — eight sentences at most — that records everything a',
  'later turn would need: what the user asked for, the decisions made, the facts',
  'established, file names, numbers and code quoted exactly, and what is still',
  'unresolved. Write it as notes about the conversation, never as a reply, and add',
  'no commentary of your own.',
].join(' ');

/**
 * Split a thread into what can be folded away and what must stay.
 *
 * @param {Array} messages - stored session messages
 * @param {{ keep?: number }} [options]
 * @returns {{ head: Array, tail: Array, previous: string }|null} null when there
 *   is nothing old enough to be worth a summary
 */
export function compactionPlan(messages, { keep = KEEP_MESSAGES } = {}) {
  const turns = (messages || []).filter(message => message.role !== 'system');
  // Below a full exchange plus two, summarizing costs a round trip to save nothing.
  if (turns.length <= keep + 2) return null;
  return {
    head: turns.slice(0, turns.length - keep),
    tail: turns.slice(-keep),
    // An earlier summary is not lost: it is folded into the new one, so a long
    // thread compacts repeatedly without forgetting how it started.
    previous: (messages || [])
      .filter(message => message.role === 'system')
      .map(message => message.content)
      .join('\n\n'),
  };
}

function transcriptLine(message) {
  const body = message.context?.text
    ? `${message.content}\n\n${message.context.text}`
    : String(message.content || '');
  const who = message.role === 'user' ? 'User' : 'Assistant';
  const clipped = body.length > MESSAGE_CAP ? `${body.slice(0, MESSAGE_CAP)} […]` : body;
  return `${who}: ${clipped}`;
}

/** The thread as the summarizer sees it, bounded so compaction cannot overflow. */
export function transcriptOf(messages) {
  const text = messages.map(transcriptLine).join('\n\n');
  return text.length > TRANSCRIPT_CAP
    ? `[…] older turns left out\n\n${text.slice(-TRANSCRIPT_CAP)}`
    : text;
}

/**
 * Summarize the old end of a thread and hand back the compacted message list.
 *
 * The summary costs one request — it is billed like any other turn — and returns
 * null when there was nothing to fold away or the model gave us nothing to keep.
 *
 * @param {Array} messages - stored session messages, without the pending turn
 * @param {Object} [options]
 * @param {string} [options.provider] / [options.model] — which model writes it
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ messages: Array, replaced: number, summary: string }|null>}
 */
export async function compactMessages(messages, { provider, model, signal } = {}) {
  const plan = compactionPlan(messages);
  if (!plan) return null;

  // Not quickChat(): a summary is a one-shot side request, and it must not land
  // in the session list as a conversation of its own or re-enter compaction.
  const { chatCompletion } = await import('./providers');
  const transcript = transcriptOf(plan.head);
  const reply = await chatCompletion(provider, [
    { role: 'system', content: SUMMARIZER_PROMPT },
    {
      role: 'user',
      content: plan.previous
        ? `Earlier summary:\n${plan.previous}\n\nCarry it on through these turns:\n\n${transcript}`
        : transcript,
    },
  ], { model, signal, maxTokens: SUMMARY_TOKENS });

  const summary = String(reply || '').trim();
  if (!summary) return null;

  return {
    messages: [
      {
        role: 'system',
        content: summary,
        ts: Date.now(),
        // What was folded away, so the transcript can say so honestly.
        compacted: { replaced: plan.head.length, kept: plan.tail.length },
      },
      ...plan.tail,
    ],
    replaced: plan.head.length,
    summary,
  };
}
