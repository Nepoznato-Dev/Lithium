// Node smoke test for lithium_core.wasm — run: node test.mjs
import { readFileSync } from 'node:fs';

const bytes = readFileSync(new URL('./target/wasm32-unknown-unknown/release/lithium_core.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const x = instance.exports;
const mem = () => new Uint8Array(x.memory.buffer);

function toWasm(u8) {
  const ptr = x.alloc(u8.length);
  mem().set(u8, ptr);
  return ptr;
}
function out(len) {
  const ptr = x.out_ptr();
  return mem().slice(ptr, ptr + len);
}

// 1. LZ4 round trip
const payload = new TextEncoder().encode('lithium '.repeat(500) + '∆ unicode ✓');
const inPtr = toWasm(payload);
const compLen = x.lz4_compress(inPtr, payload.length);
const compressed = out(compLen);
console.log('lz4:', payload.length, '→', compressed.length, 'bytes');
if (compressed.length >= payload.length) throw new Error('compression not smaller on repetitive data');
const origSize = x.lz4_uncompressed_size(toWasm(compressed), compressed.length);
if (origSize !== payload.length) throw new Error('size header mismatch');
const outPtr = x.alloc(origSize);
const written = x.lz4_decompress_into(toWasm(compressed), compressed.length, outPtr, origSize);
const back = mem().slice(outPtr, outPtr + written);
if (Buffer.compare(Buffer.from(back), Buffer.from(payload)) !== 0) throw new Error('lz4 round-trip failed');
console.log('lz4 round-trip OK');

// 2. Snapshot codec round trip
const entries = [
  { id: 'root', name: 'Home', type: 'folder', parentId: null, content: null, size: 0, createdAt: 1756000000000, updatedAt: 1756000000001, idb: false },
  { id: 'n1', name: 'Hej "quotes" \\ back\nnewline', type: 'text', parentId: 'root', content: '# Hej\n- [ ] task\n[[wiki]] émoji 🎉', size: 42, createdAt: 1.5, updatedAt: 2.5, idb: false },
  { id: 'img1', name: 'photo.jpeg', type: 'image', parentId: 'root', content: null, size: 123456, createdAt: 3, updatedAt: 4, idb: true },
  { id: 'dl-model:x', name: 'Model Q4_K_M.gguf', type: 'file', parentId: 'root', content: null, size: 468000000, createdAt: 5, updatedAt: 6, idb: true, blobRef: 'model:x' },
  { id: 'dl-game:tetris', name: 'Tetris.html', type: 'file', parentId: 'root', content: null, size: 900, createdAt: 7, updatedAt: 8, idb: false, ref: '/html-games/Tetris.html' },
];
const json = new TextEncoder().encode(JSON.stringify(entries));
const encLen = x.snapshot_encode(toWasm(json), json.length);
if (!encLen) throw new Error('encode failed');
const bin = out(encLen);
console.log('snapshot: json', json.length, '→ binary', bin.length);
const decLen = x.snapshot_decode(toWasm(bin), bin.length);
if (!decLen) throw new Error('decode failed');
const decoded = JSON.parse(new TextDecoder().decode(out(decLen)));
if (decoded.length !== 5) throw new Error('entry count mismatch');
if (decoded[0].parentId !== null || decoded[0].type !== 'folder') throw new Error('root fields wrong');
if (decoded[1].name !== entries[1].name) throw new Error(`escape mismatch: ${decoded[1].name}`);
if (decoded[1].content !== entries[1].content) throw new Error('content mismatch');
if (decoded[2].idb !== true || decoded[2].size !== 123456) throw new Error('idb/size mismatch');
if (decoded[3].blobRef !== 'model:x' || decoded[3].type !== 'file') throw new Error(`blobRef mismatch: ${JSON.stringify(decoded[3])}`);
if (decoded[4].ref !== '/html-games/Tetris.html' || decoded[4].blobRef !== undefined) throw new Error(`ref mismatch: ${JSON.stringify(decoded[4])}`);
if (decoded[1].blobRef !== undefined) throw new Error('blobRef leaked into entry without one');
console.log('snapshot round-trip OK');

// 3. xxh3
const h = x.xxh3(toWasm(payload), payload.length);
console.log('xxh3:', h.toString(16));
if (h === 0n) throw new Error('hash zero');

// 4. Corrupt decode must fail cleanly
const bad = bin.slice();
bad[4] ^= 0xff;
if (x.snapshot_decode(toWasm(bad), bad.length) !== 0) throw new Error('corrupt snapshot accepted');
console.log('corrupt-snapshot rejection OK');

// 5. Markdown renderer
const mdRender = source => {
  const b = new TextEncoder().encode(source);
  const len = x.md_render(toWasm(b), b.length);
  return new TextDecoder().decode(out(len));
};
const md = '# Welcome\nSome **bold** and *italic* and ==hi== and `code` and ~~gone~~.\n- [ ] task one\n- [x] task two\n> a quote\nSee [[Second Note]] and [[Aliased|Alias]].\n\n1. one\n2. two\n\n```\nlet x = 1 < 2;\n```\n\nA [link](https://x.dev) and ![img](https://i.png) and [bad](javascript:alert(1)).';
const html = mdRender(md);
const expectAll = [
  '<h1 class="md-h md-h1">Welcome</h1>',
  '<strong>bold</strong>',
  '<em>italic</em>',
  '<mark class="md-mark">hi</mark>',
  '<code class="md-code">code</code>',
  '<del>gone</del>',
  '<li class="md-task "><span class="md-task-box">☐</span>task one</li>',
  '<li class="md-task done"><span class="md-task-box">☑</span>task two</li>',
  '<blockquote class="md-quote">a quote</blockquote>',
  '<a href="#" data-wiki="Second Note" class="md-wiki">Second Note</a>',
  '<a href="#" data-wiki="Aliased" class="md-wiki">Alias</a>',
  '<ol class="md-list"><li>one</li><li>two</li></ol>',
  '<pre class="md-pre"><code>let x = 1 &lt; 2;</code></pre>',
  '<a href="https://x.dev" target="_blank" rel="noreferrer" class="md-link">link</a>',
  '<img src="https://i.png" alt="img" style="max-width:100%;border-radius:8px" />',
  'and bad).',
];
for (const frag of expectAll) if (!html.includes(frag)) throw new Error(`markdown missing: ${frag}\nGOT: ${html}`);
console.log('markdown render OK');

// 5b. Wiki link extraction
const wikiOut = source => {
  const b = new TextEncoder().encode(source);
  return JSON.parse(new TextDecoder().decode(out(x.md_wiki_links(toWasm(b), b.length))));
};
const wikis = wikiOut('a [[One]] b [[Two|t]] c [[One]] d [[broken');
if (JSON.stringify(wikis) !== JSON.stringify(['One', 'Two'])) throw new Error(`wiki links wrong: ${wikis}`);
console.log('wiki links OK');

// 6. FS ops
const fsTree = [
  { id: 'root', name: 'Home', type: 'folder', parentId: null },
  { id: 'docs', name: 'Documents', type: 'folder', parentId: 'root' },
  { id: 'a', name: 'note.md', type: 'text', parentId: 'docs', content: 'hello "q"' },
  { id: 'b', name: 'sub', type: 'folder', parentId: 'docs' },
  { id: 'c', name: 'inner.txt', type: 'text', parentId: 'b', content: 'deep' },
];
const fsCall = req => {
  const b = new TextEncoder().encode(JSON.stringify({ tree: fsTree, ...req }));
  const len = x.fs_op(toWasm(b), b.length);
  return len ? JSON.parse(new TextDecoder().decode(out(len))) : null;
};

const doomed = fsCall({ op: 'doomed', id: 'docs' });
if (JSON.stringify(doomed.sort()) !== JSON.stringify(['a', 'b', 'c', 'docs'])) throw new Error(`doomed wrong: ${doomed}`);

const removed = fsCall({ op: 'remove', id: 'docs' });
if (removed.length !== 1 || removed[0].id !== 'root') throw new Error('remove wrong');

const moved = fsCall({ op: 'move', id: 'a', parentId: 'root', now: 123 });
if (moved.find(e => e.id === 'a').parentId !== 'root' || moved.find(e => e.id === 'a').updatedAt !== 123) throw new Error('move wrong');
const badMove = fsCall({ op: 'move', id: 'docs', parentId: 'b', now: 1 });
if (badMove.find(e => e.id === 'docs').parentId !== 'root') throw new Error('self-nesting move allowed');

const path = fsCall({ op: 'path', id: 'c' });
if (JSON.stringify(path.map(p => p.id)) !== JSON.stringify(['docs', 'b', 'c'])) throw new Error(`path wrong: ${JSON.stringify(path)}`);

const dup = fsCall({ op: 'duplicate', id: 'docs', parentId: 'root', suffix: ' (copy)', seed: 'test1', now: 456 });
const docsCopy = dup.tree.find(e => e.parentId === 'root' && e.type === 'folder' && e.id !== 'docs');
if (!docsCopy) throw new Error('duplicate: folder clone missing');
const innerCopy = dup.tree.find(e => e.name === 'inner.txt' && e.parentId !== 'b');
if (!innerCopy || innerCopy.content !== 'deep') throw new Error('duplicate: nested content lost');
if (!dup.idMap.docs || dup.idMap.c !== innerCopy.id) throw new Error('duplicate: idMap wrong');
if (dup.tree.find(e => e.id === 'a') === undefined) throw new Error('duplicate: original tree mutated');

const fileDup = fsCall({ op: 'duplicate', id: 'a', parentId: 'root', suffix: ' (copy)', seed: 'test2', now: 789 });
const aCopy = fileDup.tree.find(e => e.parentId === 'root' && e.type === 'text');
if (aCopy.name !== 'note (copy).md' || aCopy.content !== 'hello "q"') throw new Error(`file duplicate wrong: ${aCopy.name}`);
console.log('fs ops OK');

// 7. API manager: catalog + validation
const apiValidate = req => {
  const b = new TextEncoder().encode(JSON.stringify(req));
  const len = x.api_validate(toWasm(b), b.length);
  return len ? JSON.parse(new TextDecoder().decode(out(len))) : null;
};
const catalog = JSON.parse(new TextDecoder().decode(out(x.api_catalog())));
if (!Array.isArray(catalog) || catalog.length !== 35) throw new Error(`catalog size wrong: ${catalog.length}`);
if (!catalog.every(api => api.api && api.ns && api.desc && Array.isArray(api.callers))) throw new Error('catalog shape wrong');
console.log('api catalog OK —', catalog.length, 'apis');

const okCall = apiValidate({ api: 'system.set_volume', params: { level: 70 }, caller: 'widget' });
if (!okCall?.ok || okCall.params.level !== 70) throw new Error(`set_volume validation failed: ${JSON.stringify(okCall)}`);

const badRange = apiValidate({ api: 'system.set_volume', params: { level: 150 }, caller: 'widget' });
if (badRange?.ok) throw new Error('volume out of range accepted');

const missing = apiValidate({ api: 'apps.open', params: {}, caller: 'model' });
if (missing?.ok) throw new Error('missing required param accepted');

const unknown = apiValidate({ api: 'nope.nope', caller: 'user' });
if (unknown?.ok || !unknown.error.includes('unknown api')) throw new Error('unknown api accepted');

const denied = apiValidate({ api: 'widgets.set_enabled', params: { id: 'w1', enabled: true }, caller: 'widget' });
if (denied?.ok) throw new Error('widget allowed to toggle widgets');

const settingOk = apiValidate({ api: 'settings.set', params: { path: 'theme.accent', value: '#a78bfa' }, caller: 'model' });
if (!settingOk?.ok) throw new Error('valid settings.set rejected');

const settingBadEnum = apiValidate({ api: 'settings.set', params: { path: 'layout.density', value: 'huge' }, caller: 'model' });
if (settingBadEnum?.ok) throw new Error('bad density enum accepted');

const settingBadPath = apiValidate({ api: 'settings.set', params: { path: 'theme.hacked', value: 1 }, caller: 'model' });
if (settingBadPath?.ok) throw new Error('unknown settings path accepted');

const settingBadType = apiValidate({ api: 'settings.set', params: { path: 'performance.lowEndMode', value: 'yes' }, caller: 'model' });
if (settingBadType?.ok) throw new Error('wrong-typed setting accepted');

const stripped = apiValidate({ api: 'system.notify', params: { title: 'Hi', evil: '<script>' }, caller: 'widget' });
if (!stripped?.ok || stripped.params.evil !== undefined) throw new Error('unknown params not stripped');
console.log('api validation OK');

console.log('ALL WASM TESTS PASSED');
