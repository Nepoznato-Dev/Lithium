/**
 * ShieldsButton — Brave-style shields icon with blocked count badge.
 * Sits to the left of the omnibox. Clicking opens the ShieldsPanel.
 */
import { shieldsPanelOpen } from './stores/browserStore';
import { totalBlocked, shieldsEnabled } from './stores/shieldsStore';
import Icon from '../../Components/Icon';

export default function ShieldsButton() {
  const blocked = totalBlocked.value;
  const enabled = shieldsEnabled.value;

  return (
    <button
      className={`browser-nav-btn relative ${enabled ? 'text-orange-400' : 'text-white/25'}`}
      onClick={() => { shieldsPanelOpen.value = !shieldsPanelOpen.value; }}
      aria-label="Shields"
      title={`Shields ${enabled ? 'UP' : 'DOWN'}${blocked > 0 ? ` — ${blocked} blocked` : ''}`}
    >
      <Icon name="Shield" className="h-4 w-4" />
      {blocked > 0 && (
        <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FB542B] px-1 text-[9px] font-bold text-white">
          {blocked > 99 ? '99+' : blocked}
        </span>
      )}
    </button>
  );
}
