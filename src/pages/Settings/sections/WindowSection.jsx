import Icon from '../../../Components/Icon';
import { CardGroup, SettingsRow, EnhancedToggle } from '../controls';

export default function WindowSection({ settings, update }) {
  const shortcuts = [
    { keys: 'Ctrl + K', desc: 'Command palette — quick search & actions' },
    { keys: 'Alt + Tab', desc: 'Task view — switch between open windows' },
    { keys: 'Ctrl + Alt + L', desc: 'Lock the screen (requires PIN)' },
    { keys: 'Escape', desc: 'Exit game player (if enabled)' },
    { keys: 'Right-click', desc: 'Context menu on desktop & window title bars' },
  ];

  return (
    <div>
      <CardGroup label="Window Management">
        <SettingsRow title="Snap Assist" description="Show snap preview when dragging windows near screen edges">
          <EnhancedToggle value={settings.window?.snapAssist ?? false} onChange={v => update('window.snapAssist', v)} />
        </SettingsRow>
        <SettingsRow title="Translucent title bars" description="Semi-transparent window headers with backdrop blur (like Windows 11)">
          <EnhancedToggle value={settings.window?.titlebarTranslucent !== false} onChange={v => update('window.titlebarTranslucent', v)} />
        </SettingsRow>
      </CardGroup>

      <CardGroup label="Snap Layouts">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div className="settings-row-title">Drag windows to screen edges to snap</div>
            <div className="settings-row-desc">Quick layout options when Snap Assist is enabled</div>
          </div>
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'Left half', icon: 'PanelLeft' },
              { label: 'Right half', icon: 'PanelRight' },
              { label: 'Maximize', icon: 'Maximize2' },
            ].map(snap => (
              <div key={snap.label} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                <Icon name={snap.icon} className="h-4 w-4 text-white/40" />
                <span className="text-xs text-white/60">{snap.label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardGroup>

      <CardGroup label="Keyboard Shortcuts">
        {shortcuts.map(sc => (
          <div key={sc.keys} className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-desc">{sc.desc}</div>
            </div>
            <kbd className="rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-[11px] font-medium text-white/70">
              {sc.keys}
            </kbd>
          </div>
        ))}
      </CardGroup>
    </div>
  );
}
