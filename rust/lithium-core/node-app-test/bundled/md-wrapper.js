// ../../../src/lib/core.js
var exportsRef = null;
var readyPromise = null;
function coreReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        const response = await fetch(new URL("../wasm/lithium_core.wasm", import.meta.url));
        if (!response.ok) throw new Error(`wasm fetch ${response.status}`);
        const bytes = await response.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(bytes, {});
        exportsRef = instance.exports;
      } catch {
        exportsRef = null;
      }
      return exportsRef;
    })();
  }
  return readyPromise;
}
function hasWasm() {
  return Boolean(exportsRef);
}
var mem = () => new Uint8Array(exportsRef.memory.buffer);
function toWasm(u8) {
  const ptr = exportsRef.alloc(u8.length);
  mem().set(u8, ptr);
  return ptr;
}
function fromOut(len) {
  const ptr = exportsRef.out_ptr();
  return mem().slice(ptr, ptr + len);
}
function callStr(fn, text) {
  const bytes = new TextEncoder().encode(text);
  const len = fn(toWasm(bytes), bytes.length);
  return len ? new TextDecoder().decode(fromOut(len)) : null;
}
function mdRenderSync(source) {
  if (!exportsRef) return null;
  try {
    return callStr(exportsRef.md_render, source || "");
  } catch {
    return null;
  }
}
function mdWikiLinksSync(source) {
  if (!exportsRef) return null;
  try {
    const out = callStr(exportsRef.md_wiki_links, source || "");
    return out ? JSON.parse(out) : null;
  } catch {
    return null;
  }
}

// ../../../src/lib/markdown.js
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => url.startsWith("http") || url.startsWith("data:") ? `<img src="${url}" alt="${alt}" style="max-width:100%;border-radius:8px" />` : alt);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => url.startsWith("http") || url.startsWith("/") ? `<a href="${url}" target="_blank" rel="noreferrer" class="md-link">${label}</a>` : label);
  out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => `<a href="#" data-wiki="${target.trim()}" class="md-wiki">${alias ? alias.trim() : target.trim()}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  out = out.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  out = out.replace(/==([^=]+)==/g, '<mark class="md-mark">$1</mark>');
  return out;
}
function renderMarkdown(source) {
  const native = mdRenderSync(source);
  if (native !== null) return native;
  return renderMarkdownJs(source);
}
function renderMarkdownJs(source) {
  const lines = (source || "").split("\n");
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buffer2 = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buffer2.push(lines[i]);
        i += 1;
      }
      i += 1;
      html.push(`<pre class="md-pre"><code>${escapeHtml(buffer2.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level} class="md-h md-h${level}">${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      html.push('<hr class="md-hr" />');
      i += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buffer2 = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buffer2.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      html.push(`<blockquote class="md-quote">${buffer2.map(inline).join("<br/>")}</blockquote>`);
      continue;
    }
    if (/^\s*[-*]\s+\[( |x|X)\]\s+/.test(line)) {
      const buffer2 = [];
      while (i < lines.length && /^\s*[-*]\s+\[( |x|X)\]\s+/.test(lines[i])) {
        const match = lines[i].match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/);
        const done = match[1].toLowerCase() === "x";
        buffer2.push(`<li class="md-task ${done ? "done" : ""}"><span class="md-task-box">${done ? "\u2611" : "\u2610"}</span>${inline(match[2])}</li>`);
        i += 1;
      }
      html.push(`<ul class="md-list md-tasks">${buffer2.join("")}</ul>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const buffer2 = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]) && !/^\s*[-*]\s+\[( |x|X)\]\s+/.test(lines[i])) {
        buffer2.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i += 1;
      }
      html.push(`<ul class="md-list">${buffer2.join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const buffer2 = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        buffer2.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i += 1;
      }
      html.push(`<ol class="md-list">${buffer2.join("")}</ul>`);
      continue;
    }
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }
    const buffer = [line];
    i += 1;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) && !/^```/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      buffer.push(lines[i]);
      i += 1;
    }
    html.push(`<p class="md-p">${buffer.map(inline).join("<br/>")}</p>`);
  }
  return html.join("\n");
}
function wikiLinks(source) {
  const native = mdWikiLinksSync(source);
  if (native !== null) return native;
  const found = /* @__PURE__ */ new Set();
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = regex.exec(source || "")) !== null) found.add(match[1].trim());
  return [...found];
}

// md-wrapper.js
globalThis.__probe = { renderMarkdown, wikiLinks, coreReady, hasWasm };
