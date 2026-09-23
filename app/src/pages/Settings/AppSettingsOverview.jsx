import { CardGroup, SettingsRow } from './controls';
import Icon from '../../Components/Icon';

/**
 * Overview page for the "App Settings" section.
 *
 * Lists all app-registered settings pages grouped by app, with
 * navigation buttons that jump to each page.  When no apps have
 * registered settings pages, shows a helpful empty state.
 */
export default function AppSettingsOverview({ appPages, onNavigate }) {
  if (!appPages || appPages.length === 0) {
    return (
      <div style={{ padding: '2rem 1rem', textAlign: 'center', opacity: 0.5 }}>
        <p style={{ fontSize: 14, margin: 0 }}>No apps have registered settings pages.</p>
        <p style={{ fontSize: 12, marginTop: 8 }}>
          Apps can call <code style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>li.settings.registerPage()</code> to appear here.
        </p>
      </div>
    );
  }

  // Group pages by appId
  const grouped = {};
  for (const p of appPages) {
    if (!grouped[p.appId]) grouped[p.appId] = [];
    grouped[p.appId].push(p);
  }

  return (
    <div>
      {Object.entries(grouped).map(([appId, pages]) => (
        <CardGroup key={appId} label={appId}>
          {pages.map(p => (
            <SettingsRow
              key={p.id}
              title={p.title}
              description={`Settings page from ${appId}`}
              icon={<Icon name={p.icon} size={16} />}
            >
              <button
                onClick={() => onNavigate(`app:${p.appId}:${p.id}`)}
                className="px-3 py-1.5 text-xs rounded-md transition-colors"
                style={{
                  background: 'rgba(6, 182, 212, 0.1)',
                  color: '#06b6d4',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                }}
              >
                Configure
              </button>
            </SettingsRow>
          ))}
        </CardGroup>
      ))}
    </div>
  );
}
