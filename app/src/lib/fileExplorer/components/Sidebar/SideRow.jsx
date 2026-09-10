/**
 * Sidebar row — extracted directly from the monolith's SideRow component.
 */
import { memo } from 'react';
import { PngIcon } from '../common/PngIcon.jsx';

const SideRow = memo(function SideRow({ icon: SideIcon, color, label, active, onClick, onContextMenu, right, indent = false, chevron, onChevron, onDragOver, onDrop, dropActive }) {
  return (
    <div
      className={`group relative flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition-colors ${
        dropActive ? 'acc-soft acc-ring-soft' : active ? 'bg-white/[0.1] text-white' : 'text-white/70 hover:bg-white/[0.07] hover:text-white/90'
      } ${indent ? 'pl-8' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {chevron !== undefined ? (
        <button className="text-white/40 hover:text-white" onClick={event => { event.stopPropagation(); onChevron(); }} aria-label="Toggle section">
          {chevron ? <PngIcon name="ChevronDown" size={13} /> : <PngIcon name="ChevronRight" size={13} />}
        </button>
      ) : null}
      {SideIcon && <PngIcon name={SideIcon} size={16} style={{ color }} strokeWidth={1.8} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {right}
    </div>
  );
});

export default SideRow;
