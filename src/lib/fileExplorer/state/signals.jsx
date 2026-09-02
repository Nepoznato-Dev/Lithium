/**
 * Preact signals for all shared UI state in the file explorer.
 * Replaces the ~25 useState calls from the monolithic FileManagerApp.
 */
import { signal, computed } from '@preact/signals';

// ── Tab state ──
export const tabs = signal([
  { id: 'tab-1', driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }], view: 'files' },
]);
export const activeTabId = signal('tab-1');
export const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) || tabs.value[0]);

// ── Navigation (derived from active tab) ──
export const nav = signal({ driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }] });
export const view = signal('files'); // files | home | gallery

// ── View preferences ──
export const viewMode = signal('grid'); // grid | list
export const sortField = signal('name');
export const sortDirection = signal('asc');
export const showHiddenFiles = signal(false);
export const showPreviewPane = signal(false);
export const showSidebar = signal(true);
export const sidebarWidth = signal(208); // w-52 = 13rem = 208px

// ── Selection ──
export const selectedItems = signal(new Set());
export const hoveredItem = signal(null);

// ── Clipboard ──
export const clipboard = signal(null); // { op: 'copy'|'cut', id: string }

// ── Operations queue ──
export const operations = signal([]);

// ── UI state ──
export const draggingId = signal(null);
export const dialog = signal(null); // { mode: 'rename'|'folder'|'file', entry? }
export const editor = signal(null); // text editor overlay
export const preview = signal(null); // preview overlay
export const connectOpen = signal(false);
export const storageOpen = signal(false);
export const cloudError = signal('');
export const cloudLoading = signal(false);
export const authIssue = signal(null); // config whose token was rejected
export const reconnectConfig = signal(null);

// ── Pins (quick access) ──
export const pins = signal(['default-desktop', 'default-downloads', 'default-documents', 'default-pictures', 'default-music', 'default-videos']);

// ── Sidebar sections ──
export const thisPCOpen = signal(true);
export const networkOpen = signal(false);

// ── Cloud items (for the current cloud folder) ──
export const cloudItems = signal([]);

// ── Draft text for editor ──
export const draft = signal('');

// ── Storage snapshot ──
export const snapshot = signal(null);

/** Reset selection when navigating. */
export function clearSelection() {
  selectedItems.value = new Set();
}

/** Get the single selected entry (backward compat with single-select code). */
export function getSingleSelected() {
  const items = selectedItems.value;
  if (items.size !== 1) return null;
  return items.values().next().value;
}
