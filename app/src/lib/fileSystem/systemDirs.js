/**
 * System directory structure for Lithium OS.
 *
 * Defines the canonical folder layout that every service and app can rely on.
 * Folders are seeded into the virtual FS on first boot via the seeder in
 * fileSystem.js.  System folders carry `system: true` so the UI can hide or
 * protect them from accidental deletion.
 *
 * Layout:
 *   /System/                 — OS-level configuration
 *   /System/Privacy/         — Blocklists, custom rules
 *   /System/Privacy/Cosmetic/ — CSS cosmetic filter rules
 *   /Home/                   — Per-profile user roots
 *   /Documents/AI/           — AI conversation exports
 *   /Documents/Articles/     — Reader-saved articles
 *   /Documents/Bookmarks/    — Bookmark exports
 */

const NOW = () => Date.now();

/** Canonical system directory definitions.  Each entry is a folder object
 *  matching the shape used by the virtual FS tree. */
export const SYSTEM_DIRS = [
  // ── /System ──────────────────────────────────────────────────────────
  { id: 'sys-system',       name: 'System',    type: 'folder', parentId: 'root',                system: true },
  { id: 'sys-privacy',      name: 'Privacy',   type: 'folder', parentId: 'sys-system',          system: true },
  { id: 'sys-cosmetic',     name: 'Cosmetic',  type: 'folder', parentId: 'sys-privacy',         system: true },

  // ── /Home ────────────────────────────────────────────────────────────
  { id: 'sys-home',         name: 'Home',      type: 'folder', parentId: 'root',                system: true },

  // ── /Documents sub-folders ───────────────────────────────────────────
  { id: 'doc-ai',           name: 'AI',        type: 'folder', parentId: 'default-documents',   system: true },
  { id: 'doc-articles',     name: 'Articles',  type: 'folder', parentId: 'default-documents',   system: true },
  { id: 'doc-bookmarks',    name: 'Bookmarks', type: 'folder', parentId: 'default-documents',   system: true },
];

/** Well-known folder id lookup table.  Services import this instead of
 *  hard-coding ids throughout the codebase. */
export const SYS = Object.freeze({
  SYSTEM:        'sys-system',
  PRIVACY:       'sys-privacy',
  COSMETIC:      'sys-cosmetic',
  HOME:          'sys-home',
  AI:            'doc-ai',
  ARTICLES:      'doc-articles',
  BOOKMARKS:     'doc-bookmarks',
  // Re-export commonly used FS defaults for convenience:
  DOCUMENTS:     'default-documents',
  DOWNLOADS:     'default-downloads',
  DESKTOP:       'default-desktop',
  PICTURES:      'default-pictures',
  MUSIC:         'default-music',
  VIDEOS:        'default-videos',
  NOTES:         'default-notes',
  MODELS:        'default-models',
  PROJECTS:      'default-projects',
  TRASH:         'default-trash',
  ROOT:          'root',
});

/** Ensure every system directory exists in the tree.  Returns the (possibly
 *  updated) tree, or null if nothing changed. */
export function ensureSystemDirs(tree) {
  if (!Array.isArray(tree) || tree.length === 0) return null;
  let changed = false;
  const next = [...tree];
  const now = NOW();
  for (const dir of SYSTEM_DIRS) {
    if (!next.some(entry => entry.id === dir.id)) {
      next.push({ ...dir, createdAt: now, updatedAt: now });
      changed = true;
    }
  }
  return changed ? next : null;
}

/** Resolve a profile's home folder id.  Creates the folder lazily if it
 *  doesn't exist yet.  Returns { tree, folderId }. */
export function ensureProfileHome(tree, profileId) {
  const homeId = `home-${profileId}`;
  const existing = tree.find(e => e.id === homeId);
  if (existing) return { tree, folderId: homeId };
  const now = NOW();
  const folder = { id: homeId, name: profileId, type: 'folder', parentId: SYS.HOME, createdAt: now, updatedAt: now };
  return { tree: [...tree, folder], folderId: homeId };
}
