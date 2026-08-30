// Node fetch can't do file:// — shim it so core.js's wasm load works here.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const origFetch = globalThis.fetch;
globalThis.fetch = async url => {
  const u = String(url);
  if (u.startsWith('file://')) {
    const data = await readFile(fileURLToPath(u));
    return { ok: true, status: 200, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
  }
  return origFetch(url);
};

await import('./bundled/md-wrapper.js');
await import('./bundled/fs-wrapper.js');
const { renderMarkdown, wikiLinks, coreReady, hasWasm } = globalThis.__probe;
const fs = globalThis.__fs;
const assert = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); };

await coreReady();
await globalThis.__fsCore(); // separate bundle copy of core.js
console.log('core.js hasWasm():', hasWasm());
assert(hasWasm(), 'wasm not loaded through core.js');

// markdown through the real app module
const html = renderMarkdown('# Hi\nSome **bold**, ==mark==, `code`\n- [x] done\nSee [[Target]]');
assert(html.includes('<h1 class="md-h md-h1">Hi</h1>'), 'heading: ' + html);
assert(html.includes('<strong>bold</strong>'), 'bold');
assert(html.includes('<mark class="md-mark">mark</mark>'), 'mark');
assert(html.includes('md-task done'), 'task');
assert(html.includes('data-wiki="Target"'), 'wiki');
assert(JSON.stringify(wikiLinks('a [[One]] b [[One]]')) === JSON.stringify(['One']), 'wikiLinks');
console.log('app markdown.js ? wasm OK');

// fs through the real app module
const tree = [
  { id: 'root', name: 'Home', type: 'folder', parentId: null },
  { id: 'd', name: 'Docs', type: 'folder', parentId: 'root' },
  { id: 'f', name: 'n.md', type: 'text', parentId: 'd', content: 'x' },
];
const dup = fs.duplicateSubtree(tree, 'd', 'root');
assert(dup.idMap instanceof Map && dup.idMap.size === 2, 'duplicateSubtree idMap');
assert(dup.tree.length === 5, 'duplicateSubtree tree');
const copy = dup.tree.find(e => e.parentId === 'root' && e.type === 'folder' && e.id !== 'd');
assert(copy && copy.id === dup.idMap.get('d'), 'duplicateSubtree mapping');
assert(fs.moveEntry(tree, 'f', 'root').find(e => e.id === 'f').parentId === 'root', 'moveEntry');
assert(fs.moveEntry(tree, 'd', 'f') === tree, 'moveEntry guard');
assert(JSON.stringify(fs.pathOf(dup.tree, dup.idMap.get('f')).map(p => p.id)) === JSON.stringify([dup.idMap.get('d'), dup.idMap.get('f')]), 'pathOf clone');
assert(JSON.stringify(fs.pathOf(dup.tree, 'f').map(p => p.id)) === JSON.stringify(['d', 'f']), 'pathOf original');
assert(fs.removeEntry(tree, 'd').length === 1, 'removeEntry');
assert(JSON.stringify(fs.subtreeFolderIds(tree, 'd')) === JSON.stringify(['d']), 'subtreeFolderIds');
console.log('app fileSystem.js ? wasm OK');
console.log('APP-MODULE VERIFICATION PASSED');
