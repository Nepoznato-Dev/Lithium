/**
 * Shared registry of desktop apps — populated by useDesktopState when the
 * apps array resolves, consumed by File Explorer to render virtual `.li`
 * shortcut entries inside the Desktop folder.
 *
 * Keeping this as a plain module (no React) means the File Explorer can
 * read the list without importing the component tree.
 */

let _apps = [];

/** Replace the current desktop-apps snapshot. */
export function setDesktopApps(apps) {
  _apps = apps || [];
}

/** Return the latest desktop-apps snapshot. */
export function getDesktopApps() {
  return _apps;
}
