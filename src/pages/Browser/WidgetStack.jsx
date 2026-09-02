/**
 * WidgetStack — Brave-style tabbed widget container.
 * Shows icon-tab buttons at the top to switch between widgets.
 * Each tab renders a different widget in the body area.
 */
import { useState } from 'preact/hooks';

const TAB_ICONS = {
  stats: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  news: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" />
    </svg>
  ),
};

export default function WidgetStack({ tabs, children }) {
  // children is an array of { key, content } objects
  const [activeTab, setActiveTab] = useState(tabs[0]);

  const activeChild = children.find(c => c.key === activeTab);

  return (
    <div className="ntp-widget-stack">
      {tabs.length > 1 && (
        <div className="ntp-stack-tabs">
          {tabs.map(tab => (
            <button
              key={tab}
              className={`ntp-stack-tab${tab === activeTab ? ' ntp-stack-tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
              title={tab.charAt(0).toUpperCase() + tab.slice(1)}
            >
              {TAB_ICONS[tab] || tab}
            </button>
          ))}
        </div>
      )}
      <div className="ntp-stack-body">
        {activeChild?.content || null}
      </div>
    </div>
  );
}
