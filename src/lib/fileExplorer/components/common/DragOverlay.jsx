/**
 * Drag ghost overlay — shown while dragging items.
 */
import { draggingId } from '../../state/signals.jsx';

export default function DragOverlay() {
  if (!draggingId.value) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50" />
  );
}
