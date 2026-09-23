/**
 * Toolbar — folder-level and selection-level actions for the file shell.
 *
 * Extracted from the monolith's toolbar section.
 *
 * Every button dispatches through the ActionRegistry rather than calling a shell
 * handler directly, so a click and its keyboard/menu twin (Del, F2, right-click)
 * share one implementation — including the `when()` predicate that decides
 * whether the action applies at all, the batch handling for multi-selection, and
 * the confirm prompts. Visibility, enablement, label, icon and danger styling all
 * come from the descriptor via `actionState()`, so adding an id to the lists
 * below is the only edit a new action needs here.
 *
 * Two things are deliberately absent:
 *  - Navigation. AddressBar owns back/forward, and `useHistory` keeps its stacks
 *    in refs scoped to each call site, so a second instance here would be a
 *    disconnected history whose `canBack` never turns true.
 *  - Storage manager and cloud connect. Both already live in the sidebar (the
 *    usage bar opens the former, a Quick-access row the latter), so repeating
 *    them would only give two controls one job.
 */
import { memo } from 'react';
import { PngIcon } from '../common/PngIcon.jsx';
import { nav, viewMode, selectedItems } from '../../state/signals.jsx';
import { getEntry, isTrashed, TRASH_ID } from '../../../fileSystem.js';

/** Folder-level buttons act on the current directory — the empty-space scope. */
const FOLDER_ACTIONS = ['fs.new-folder', 'fs.new-file', 'fs.upload'];

/** Selection-level buttons act on whatever is highlighted. */
const SELECTION_ACTIONS = ['fs.rename', 'fs.delete', 'fs.restore'];

function Toolbar({ tree, drive, onAction, actionState, handleEmptyTrash }) {
  const folderId = nav.value.stack[nav.value.stack.length - 1]?.id;
  const isInTrash = !drive && nav.value.driveId === 'local' && folderId === TRASH_ID;
  const isTrashSubfolder = !drive && folderId !== TRASH_ID && (() => {
    const entry = getEntry(tree, folderId);
    return entry && (entry.parentId === TRASH_ID || isTrashed(entry));
  })();
  const isInsideTrash = isInTrash || isTrashSubfolder;

  const count = selectedItems.value.size;
  const selectionScope = count > 1 ? 'multi' : 'entry';

  // Resolved once per render: each call reads `selectedItems`, so doing it in
  // the map body would re-run the entry lookup per button.
  const folderBtns = isInsideTrash
    // Creating or importing into the Recycle Bin is meaningless, and the
    // registry has no notion of trash — the one rule that has to stay here.
    ? []
    : FOLDER_ACTIONS
      .map(id => ({ id, scope: 'empty', ...actionState(id, 'empty') }))
      .filter(a => a.visible);
  const selBtns = SELECTION_ACTIONS
    .map(id => ({ id, scope: selectionScope, ...actionState(id, selectionScope) }))
    .filter(a => a.visible);

  const renderBtn = a => (
    <button
      key={a.id}
      type="button"
      className={`icon-btn h-8 w-8 shrink-0 ${a.danger ? 'hover:bg-red-500/15 hover:text-red-300' : ''}`}
      title={a.label}
      aria-label={a.label}
      disabled={!a.enabled}
      onClick={() => onAction(a.id, a.scope)}
    >
      {a.icon ? <PngIcon name={a.icon} size={15} /> : <span className="text-[11px]">{a.label}</span>}
    </button>
  );

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-3 py-1.5">
      <button
        type="button"
        className={`icon-btn h-8 w-8 shrink-0 ${viewMode.value === 'grid' ? 'acc-text' : ''}`}
        title="Large icons"
        aria-label="Large icons"
        onClick={() => { viewMode.value = 'grid'; }}
      >
        <PngIcon name="LayoutGrid" size={15} />
      </button>
      <button
        type="button"
        className={`icon-btn h-8 w-8 shrink-0 ${viewMode.value === 'list' ? 'acc-text' : ''}`}
        title="Details"
        aria-label="Details"
        onClick={() => { viewMode.value = 'list'; }}
      >
        <PngIcon name="List" size={15} />
      </button>

      {/* `fs.view-mode` is a submenu parent whose execute() is a no-op, so the
          two toggles set `viewMode` themselves — the same one-liner its children
          assign. Everything else below goes through the registry. */}

      {(folderBtns.length > 0 || selBtns.length > 0) && <div className="mx-1 h-5 w-px shrink-0 bg-white/[0.08]" />}

      {folderBtns.map(renderBtn)}
      {folderBtns.length > 0 && selBtns.length > 0 && <div className="mx-1 h-5 w-px shrink-0 bg-white/[0.08]" />}
      {selBtns.map(renderBtn)}

      {/* No registry action backs this one — `purgeTrash` is shell state — so it
          keeps a direct handler until emptying the bin is worth registering. */}
      {isInsideTrash && tree.some(e => e.parentId === folderId) && (
        <button
          type="button"
          className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-500/20"
          title="Permanently delete all items"
          onClick={handleEmptyTrash}
        >
          <PngIcon name="Trash2" size={13} /> Empty
        </button>
      )}
    </div>
  );
}

export default memo(Toolbar);
