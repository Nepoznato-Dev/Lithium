/**
 * Web Worker for on-device AI inference via wllama (llama.cpp → WASM).
 *
 * Keeps the heavy WASM runtime, model loading, and token-by-token
 * generation off the main thread so the UI stays responsive during
 * chat.  Communication with the main thread is via a simple
 * request/response protocol over postMessage.
 *
 * Protocol (main → worker):
 *   { id, cmd: 'LOAD',   wasmUrl, buffer, nCtx }
 *   { id, cmd: 'CHAT',   messages, options }
 *   { id, cmd: 'UNLOAD' }
 *
 * Protocol (worker → main):
 *   { id, type: 'TOKEN',  token, text }
 *   { id, type: 'DONE',   text }
 *   { id, type: 'ERROR',  error }
 *   { id, type: 'OK' }
 */

let wllama = null;

/** Lazily import the Wllama class (bundled by Vite into the worker chunk). */
async function getWllama() {
  if (!getWllama._class) {
    const mod = await import('@wllama/wllama');
    getWllama._class = mod.Wllama;
  }
  return getWllama._class;
}

async function handleLoad(msg) {
  if (wllama) {
    await wllama.exit().catch(() => {});
    wllama = null;
  }

  const WllamaClass = await getWllama();
  wllama = new WllamaClass(
    { default: msg.wasmUrl },
    { suppressNativeLog: true },
  );
  await wllama.loadModel([msg.buffer], {
    n_ctx: msg.nCtx || 8192,
    n_batch: 512,
    flash_attn: true,
  });
}

async function handleChat(msg) {
  if (!wllama) throw new Error('No model loaded in worker');

  const stream = await wllama.createChatCompletion({
    messages: msg.messages,
    stream: true,
    temperature: msg.options?.temperature ?? 0.7,
    max_tokens: msg.options?.maxTokens || 600,
  });

  let text = '';
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || '';
    if (delta) {
      text += delta;
      self.postMessage({ id: msg.id, type: 'TOKEN', token: delta, text });
    }
  }
  return text;
}

async function handleUnload() {
  if (wllama) {
    await wllama.exit().catch(() => {});
    wllama = null;
  }
}

self.onmessage = async (event) => {
  const msg = event.data;
  const { id, cmd } = msg;

  try {
    if (cmd === 'LOAD') {
      await handleLoad(msg);
      self.postMessage({ id, type: 'OK' });
    } else if (cmd === 'CHAT') {
      const text = await handleChat(msg);
      self.postMessage({ id, type: 'DONE', text });
    } else if (cmd === 'UNLOAD') {
      await handleUnload();
      self.postMessage({ id, type: 'OK' });
    }
  } catch (err) {
    self.postMessage({ id, type: 'ERROR', error: err.message || String(err) });
  }
};
