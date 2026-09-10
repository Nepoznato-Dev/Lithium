import { getEntry } from '../../../../lib/fileSystem';

export const PROJECTS_ID = 'default-projects';
export const CODE_EXT = /\.(jsx?|tsx?|mjs|cjs|py|rb|go|rs|java|c|cpp|hpp|h|cs|php|sh|html?|css|scss|json|ya?ml|sql|vue|svelte)$/i;

export const projectPath = (tree, id) => {
  const names = [];
  let e = getEntry(tree, id);
  while (e && e.parentId !== PROJECTS_ID) { names.unshift(e.name); e = getEntry(tree, e.parentId); }
  if (e) names.unshift(e.name);
  return names.join('/');
};

export const extColor = name => CODE_EXT.test(name || '') ? 'text-[#6a9fb5]' : 'text-white/40';
