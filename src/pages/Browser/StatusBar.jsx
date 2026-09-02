/**
 * StatusBar — Brave-style bottom bar showing hover URL preview.
 * Appears in the bottom-left corner as a floating tooltip.
 */
import { signal } from '@preact/signals';
import Icon from '../../Components/Icon';

/** Signal for the hovered URL (set by iframe mouseover, cleared on mouseout). */
export const hoverUrl = signal('');

export default function StatusBar() {
  const url = hoverUrl.value;
  if (!url) return null;

  let display = url;
  try { display = new URL(url).hostname.replace(/^www\./, '') + new URL(url).pathname; } catch {}

  return (
    <div className="pointer-events-none fixed bottom-1 left-1 z-50 max-w-md">
      <div className="flex items-center gap-1.5 rounded-md bg-[#2a2a3e] px-2.5 py-1 text-[11px] text-white/60 shadow-lg">
        <Icon name="Globe" className="h-3 w-3 shrink-0 opacity-40" />
        <span className="truncate">{display}</span>
      </div>
    </div>
  );
}
