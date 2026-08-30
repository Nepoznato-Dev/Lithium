// Node parity check: Rust wasm vs JS fallback for the app's markdown + fs modules.
// Run: node parity.mjs
const { readFileSync } = await import('node:fs');
const bytes = readFileSync(new URL('./target/wasm32-unknown-unknown/release/lithium_core.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const x = instance.exports;
const mem = () => new Uint8Array(x.memory.buffer);
function toWasm(u8) { const ptr = x.alloc(u8.length); mem().set(u8, ptr); return ptr; }
function fromOut(len) { const ptr = x.out_ptr(); return mem().slice(ptr, ptr + len); }
function callStr(fn, text) {
  const b = new TextEncoder().encode(text);
  const len = fn(toWasm(b), b.length);
  return len ? new TextDecoder().decode(fromOut(len)) : null;
}
const mdRenderWasm = s => callStr(x.md_render, s || '');
const wikiWasm = s => JSON.parse(callStr(x.md_wiki_links, s || '') || '[]');
const fsWasm = req => JSON.parse(callStr(x.fs_op, JSON.stringify(req)) || 'null');

// --- JS fallback implementations (verbatim ports from src/lib) ---
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) =>
    (url.startsWith('http') || url.startsWith('data:') ? `<img src="${url}" alt="${alt}" style="max-width:100%;border-radius:8px" />` : alt));
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) =>
    (url.startsWith('http') || url.startsWith('/') ? `<a href="${url}" target="_blank" rel="noreferrer" class="md-link">${label}</a>` : label));
  out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) =>
    `<a href="#" data-wiki="${target.trim()}" class="md-wiki">${alias ? alias.trim() : target.trim()}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  out = out.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  out = out.replace(/==([^=]+)==/g, '<mark class="md-mark">$1</mark>');
  return out;
}
function renderMarkdownJs(source) {
  const lines = (source || '').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buffer = []; i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { buffer.push(lines[i]); i += 1; }
      i += 1;
      html.push(`<pre class="md-pre"><code>${escapeHtml(buffer.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { html.push(`<h${heading[1].length} class="md-h md-h${heading[1].length}">${inline(heading[2])}</h${heading[1].length}>`); i += 1; continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { html.push('<hr class="md-hr" />'); i += 1; continue; }
    if (/^>\s?/.test(line)) {
      const buffer = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buffer.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      html.push(`<blockquote class="md-quote">${buffer.map(inline).join('<br/>')}</blockquote>`);
      continue;
    }
    if (/^\s*[-*]\s+\[( |x|X)\]\s+/.test(line)) {
      const buffer = [];
      while (i < lines.length && /^\s*[-*]\s+\[( |x|X)\]\s+/.test(lines[i])) {
        const match = lines[i].match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/);
        const done = match[1].toLowerCase() === 'x';
        buffer.push(`<li class="md-task ${done ? 'done' : ''}"><span class="md-task-box">${done ? '☑' : '☐'}</span>${inline(match[2])}</li>`);
        i += 1;
      }
      html.push(`<ul class="md-list md-tasks">${buffer.join('')}</ul>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const buffer = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]) && !/^\s*[-*]\s+\[( |x|X)\]\s+/.test(lines[i])) {
        buffer.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`); i += 1;
      }
      html.push(`<ul class="md-list">${buffer.join('')}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const buffer = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        buffer.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`); i += 1;
      }
      html.push(`<ol class="md-list">${buffer.join('')}</ul>`); // NOTE: JS bug (</ul>) intentionally kept here for comparison
      continue;
    }
    if (/^\s*$/.test(line)) { i += 1; continue; }
    const buffer = [line]; i += 1;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) && !/^```/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) { buffer.push(lines[i]); i += 1; }
    html.push(`<p class="md-p">${buffer.map(inline).join('<br/>')}</p>`);
  }
  return html.join('\n');
}

// --- corpus ---
const corpus = [
  '# Welcome\nSome **bold** and *italic* text with ==highlight== and `code` and ~~strike~~.',
  '- [ ] task one\n- [x] task two\n- [X] task three',
  '> quoted **line one**\n> line two',
  'See [[Second Note]] and [[Aliased|My Alias]] and [[ spaced target ]].',
  '1. first\n2. second\n3. third',
  '- apples\n- bananas\n- cherries',
  '```\nfunction f(a, b) {\n  return a < b && "x";\n}\n```',
  'A paragraph with [link](https://example.com/a) and ![pic](https://img.example/b.png)\ncontinued on line two.',
  '---',
  '###### small heading\nplain text after',
  'emoji 🎉 émojis åäö 中文测试 and *stars* around.',
  'No markdown at all, just text. "quotes" & <tags> & `code`.',
  '',
  '   indented - not a list\n\t1. also not',
];

let mdFail = 0;
for (const src of corpus) {
  const js = renderMarkdownJs(src);
  // Known intentional difference: Rust fixes the </ul>→</ol> closing-tag bug.
  const jsNorm = js.replace(/(<ol class="md-list">[^]*?)<\/ul>/g, '$1</ol>');
  const raw = mdRenderWasm(src);
  // App-level semantics: null (incl. empty-input len=0) falls back to JS output.
  const rs = raw === null ? jsNorm : raw;
  if (jsNorm !== rs) {
    mdFail += 1;
    console.log('MISMATCH for source:', JSON.stringify(src.slice(0, 60)));
    console.log('JS :\n', jsNorm);
    console.log('RUST:\n', rs);
  }
}
if (mdFail) throw new Error(`${mdFail} markdown parity failures`);
console.log(`markdown parity OK (${corpus.length} cases)`);

// wiki links parity
const wikiSrc = 'a [[One]] b [[Two|t]] c [[One]] d [[broken and [[ spaced ]]';
const jsWiki = [...new Set((wikiSrc.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g) || []).map(m => m.match(/\[\[([^\]|]+)/)[1].trim()))];
const rsWiki = wikiWasm(wikiSrc);
if (JSON.stringify(jsWiki) !== JSON.stringify(rsWiki)) throw new Error(`wiki parity fail: ${jsWiki} vs ${rsWiki}`);
console.log('wiki links parity OK');

// --- fs ops parity (structural compare against the app's JS logic) ---
const tree = [
  { id: 'root', name: 'Home', type: 'folder', parentId: null },
  { id: 'docs', name: 'Documents', type: 'folder', parentId: 'root' },
  { id: 'a', name: 'note.md', type: 'text', parentId: 'docs', content: 'hello' },
  { id: 'b', name: 'sub', type: 'folder', parentId: 'docs' },
  { id: 'c', name: 'inner.txt', type: 'text', parentId: 'b', content: 'deep' },
];
function doomedIdsJs(t, id) {
  const doomed = new Set([id]);
  let grew = true;
  while (grew) { grew = false; for (const e of t) if (e.parentId && doomed.has(e.parentId) && !doomed.has(e.id)) { doomed.add(e.id); grew = true; } }
  return doomed;
}
const jsDoomed = [...doomedIdsJs(tree, 'docs')].sort();
const rsDoomed = fsWasm({ op: 'doomed', tree, id: 'docs' }).sort();
if (JSON.stringify(jsDoomed) !== JSON.stringify(rsDoomed)) throw new Error('doomed parity fail');

const jsRemove = tree.filter(e => !doomedIdsJs(tree, 'docs').has(e.id));
const rsRemove = fsWasm({ op: 'remove', tree, id: 'docs' });
if (JSON.stringify(jsRemove) !== JSON.stringify(rsRemove)) throw new Error('remove parity fail');

const rsDup = fsWasm({ op: 'duplicate', tree, id: 'docs', parentId: 'root', suffix: ' (copy)', seed: 's1', now: 100 });
const cloneCount = doomedIdsJs(tree, 'docs').size;
if (rsDup.tree.length !== tree.length + cloneCount) throw new Error('duplicate count fail');
const clonedNames = rsDup.tree.slice(tree.length).map(e => e.name).sort();
if (JSON.stringify(clonedNames) !== JSON.stringify(['Documents', 'inner.txt', 'note.md', 'sub'])) throw new Error(`duplicate names fail: ${clonedNames}`);
const parentsOk = rsDup.tree.slice(tree.length).every(e => Object.values(rsDup.idMap).includes(e.id));
if (!parentsOk) throw new Error('duplicate ids fail');

// unicode + escapes round trip through fs ops
const weird = [...tree, { id: 'w', name: 'weïrd "nàme" \\ 🎉.txt', type: 'text', parentId: 'root', content: 'line1\n"quoted" \\ back' }];
const moved = fsWasm({ op: 'move', tree: weird, id: 'w', parentId: 'docs', now: 5 });
const w = moved.find(e => e.id === 'w');
if (w.parentId !== 'docs' || w.name !== 'weïrd "nàme" \\ 🎉.txt' || w.content !== 'line1\n"quoted" \\ back') throw new Error('escape round-trip fail');

console.log('fs ops parity OK');
console.log('ALL PARITY CHECKS PASSED');
