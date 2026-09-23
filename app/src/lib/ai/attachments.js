/**
 * Conversation attachments.
 *
 * A file dropped on the composer is read once, on the spot: text becomes a
 * block of context, an image becomes a data URL that either goes out as a
 * multimodal content part or is described in words when the model cannot see.
 *
 * Nothing here is persisted. A base64 picture in localStorage would eat the
 * quota for a fact the model looks at exactly once, so attachments live in the
 * composer's state until the turn that carries them.
 */

/** Character cap per text attachment (~50K tokens). Past this the tail is cut. */
export const MAX_TEXT_CHARS = 200_000;

/** Refuse an image above this rather than bloat a request the provider will reject. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Extensions that mean "read this as text" even when the browser guessed `''`. */
const TEXTISH = /\.(txt|md|markdown|mdx|json|jsonc|json5|ya?ml|toml|csv|tsv|log|ini|conf|env|properties|js|jsx|mjs|cjs|ts|tsx|css|scss|less|html|htm|xml|svg|py|rs|go|c|h|cpp|hpp|cc|java|kt|rb|php|pl|lua|r|swift|sh|bash|zsh|ps1|bat|sql|graphql|prisma|vue|svelte|astro|dart|zig|nim|ex|exs|erl|hs|ml|clj|tf|diff|patch|gitignore|editorconfig|dockerfile|makefile)$/i;

const MIME_TEXTISH = /^text\//i;
const MIME_JSONISH = /^application\/(json|xml|x-yaml|x-toml|javascript|typescript|sql|graphql)/i;

function isTextual(file) {
  const type = String(file.type || '');
  if (type.startsWith('image/')) return false;
  if (!type) return true;                       // The browser often reports '' for code
  return MIME_TEXTISH.test(type) || MIME_JSONISH.test(type) || TEXTISH.test(file.name || '');
}

function makeId() {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`could not read ${file.name || 'file'}`));
    reader.readAsDataURL(file);
  });
}

/** Pixel dimensions of a data-URL image, so a text-only model still gets told
 *  what it was handed. Resolves to zeros when the decode fails. */
function imageSize(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    const settle = (width, height) => resolve({ width, height });
    img.onload = () => settle(img.naturalWidth || img.width || 0, img.naturalHeight || img.height || 0);
    img.onerror = () => settle(0, 0);
    img.src = dataUrl;
  });
}

async function readOne(file) {
  const base = {
    id: makeId(),
    name: file.name || 'attachment',
    size: file.size || 0,
    mime: file.type || '',
  };

  if (String(file.type || '').startsWith('image/')) {
    if (base.size > MAX_IMAGE_BYTES) {
      throw new Error(`${base.name} is over ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB`);
    }
    const content = await readAsDataURL(file);
    const { width, height } = await imageSize(content);
    return { ...base, type: 'image', content, width, height };
  }

  if (!isTextual(file)) throw new Error(`${base.name} is not a text file or an image`);

  const full = await file.text();
  const truncated = full.length > MAX_TEXT_CHARS;
  return {
    ...base,
    type: 'file',
    content: truncated ? full.slice(0, MAX_TEXT_CHARS) : full,
    // Carried through to the serialized block so the model knows it is reading
    // a fragment rather than the whole file.
    note: truncated ? `truncated from ${full.length.toLocaleString()} characters` : '',
  };
}

/**
 * Turn a FileList (drop, picker, or clipboard) into attachment records.
 *
 * One unreadable file must not discard the rest, so failures come back as
 * messages alongside whatever did load.
 *
 * @param {FileList|File[]} fileList
 * @returns {Promise<{ attachments: Array, errors: string[] }>}
 */
export async function readFiles(fileList) {
  const files = Array.from(fileList || []);
  const results = await Promise.allSettled(files.map(readOne));
  const attachments = [];
  const errors = [];
  for (const result of results) {
    if (result.status === 'fulfilled') attachments.push(result.value);
    else errors.push(result.reason?.message || 'One file could not be read');
  }
  return { attachments, errors };
}

/**
 * The text an attachment contributes to the prompt.
 *
 * Text files always arrive in full. An image arrives as a caption — the pixels
 * go out separately as a content part when `vision` is set, and the caption is
 * all a text-only model ever gets.
 *
 * @param {Array} attachments
 * @param {{ vision?: boolean }} [options]
 * @returns {string} empty when there is nothing to attach
 */
export function serializeAttachments(attachments, { vision = false } = {}) {
  return (attachments || []).map(att => {
    if (att.type === 'image') {
      const box = att.width && att.height ? `${att.width}x${att.height}` : '';
      const shown = vision ? '' : ', not available to this model';
      return `[Image attached: ${att.name}${box ? `, ${box}` : ''}${shown}]`;
    }
    const head = `[Attached: ${att.name}]`;
    return att.note ? `${head}\n${att.content}\n(${att.note})` : `${head}\n${att.content}`;
  }).join('\n\n');
}

/** OpenAI multimodal parts for the images, in the order they were attached. */
export function imageParts(attachments) {
  return (attachments || [])
    .filter(att => att.type === 'image' && String(att.content).startsWith('data:'))
    .map(att => ({ type: 'image_url', image_url: { url: att.content, detail: 'auto' } }));
}
