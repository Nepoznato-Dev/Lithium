/**
 * Sidebar row — extracted directly from the monolith's SideRow component.
 */
import Icon from '../../../../Components/Icon';

export default function SideRow({ icon: SideIcon, color, label, active, onClick, onContextMenu, right, indent = false, chevron, onChevron, onDragOver, onDrop, dropActive }) {
  return (
    <div
      className={`group flex cursor-pointer items-center gap-2.5 rounded px-2 py-[7px] text-[13px] transition-colors ${
        dropActive ? 'acc-soft acc-ring-soft' : active ? 'bg-white/[0.12] text-white' : 'text-white/75 hover:bg-white/[0.06]'
      } ${indent ? 'pl-7' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {chevron !== undefined ? (
        <button className="text-white/40 hover:text-white" onClick={event => { event.stopPropagation(); onChevron(); }} aria-label="Toggle section">
          {chevron ? <Icon name="ChevronDown" size={13} /> : <Icon name="ChevronRight" size={13} />}
        </button>
      ) : null}
      {SideIcon && <Icon name={SideIcon} size={16} style={{ color }} strokeWidth={1.8} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {right}
    </div>
  );
}
