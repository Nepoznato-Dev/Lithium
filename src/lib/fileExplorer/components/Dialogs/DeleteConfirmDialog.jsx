/**
 * Delete confirmation dialog — replaces window.confirm calls.
 */
import Icon from '../../../../Components/Icon';

export default function DeleteConfirmDialog({ entry, permanent, driveLabel, onConfirm, onClose }) {
  const message = permanent
    ? `Permanently delete "${entry.name}"? This cannot be undone.`
    : driveLabel
      ? `Delete "${entry.name}" from ${driveLabel}?`
      : `Move "${entry.name}" to the Recycle Bin?`;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1c1c22] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <Icon name="Trash2" size={16} className="text-red-400" />
          {permanent ? 'Delete permanently' : 'Delete'}
        </h3>
        <p className="mb-4 text-xs leading-relaxed text-white/70">{message}</p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onClose}>Cancel</button>
          <button className="rounded-lg bg-red-500/80 px-3 py-1.5 text-xs text-white hover:bg-red-500" onClick={onConfirm}>
            {permanent ? 'Delete permanently' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
