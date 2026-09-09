/**
 * Drag ghost overlay — shown while dragging items.
 */
import { memo } from 'react';
import { draggingId } from '../../state/signals.jsx';

export default memo(function DragOverlay() {
  if (!draggingId.value) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50" />
  );
});
