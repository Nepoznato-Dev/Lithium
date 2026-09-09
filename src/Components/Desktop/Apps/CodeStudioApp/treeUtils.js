import { childrenOf } from '../../../../lib/fileSystem';
import { PROJECTS_ID } from './constants';

export function findByPath(tree, path) {
  const segs = path.split('/').filter(Boolean);
  let parent = PROJECTS_ID; let cur = null;
  for (const seg of segs) { cur = childrenOf(tree, parent).find(e => e.name === seg); if (!cur) return null; parent = cur.id; }
  return cur;
}

export function tabContentFor(tree, entry, tabs) {
  const t = tabs.find(x => x.id === entry.id);
  if (t) return t.content;
  return '';
}
