/**
 * Conflict dialog — name collision resolution during move/copy operations.
 * New feature for the restructured explorer.
 */
import Icon from '../../../../Components/Icon';

export default function ConflictDialog({ existingName, onReplace, onRename, onSkip, onSkipAll, onClose }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1c1c22] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <Icon name="AlertTriangle" size={16} className="text-amber-400" />
          Name conflict
        </h3>
        <p className="mb-4 text-xs leading-relaxed text-white/70">
          An item named "<span className="font-medium text-white">{existingName}</span>" already exists in this location.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          {onSkip && <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onSkip}>Skip</button>}
          {onSkipAll && <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onSkipAll}>Skip all</button>}
          {onRename && <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onRename}>Rename</button>}
          {onReplace && <button className="rounded-lg bg-red-500/80 px-3 py-1.5 text-xs text-white hover:bg-red-500" onClick={onReplace}>Replace</button>}
        </div>
      </div>
    </div>
  );
}
