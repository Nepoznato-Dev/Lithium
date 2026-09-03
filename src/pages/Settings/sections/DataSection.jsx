import Icon from '../../../Components/Icon';
import { CardGroup } from '../controls';

export default function DataSection({ exportSettings, importSettings, exportAllData, exportFullZip, importFullZip, zipBusy, deleteAllData }) {
  return (
    <div>
      <CardGroup label="Settings Backup">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <p className="text-[13px] text-white/50">
            Export your settings as a safety backup or import from a previous export.
          </p>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 text-xs" onClick={exportSettings}>
              <Icon name="Download" className="h-3.5 w-3.5" /> Export Settings
            </button>
            <button className="btn-primary flex-1 text-xs" onClick={importSettings}>
              <Icon name="RefreshCw" className="h-3.5 w-3.5" /> Import Settings
            </button>
          </div>
        </div>
      </CardGroup>

      <CardGroup label="Full ZIP Backup">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <p className="text-[13px] text-white/50">
            Export or restore a complete ZIP backup — includes all files, photos, notes, models, and settings.
          </p>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 text-xs" onClick={exportFullZip} disabled={zipBusy}>
              {zipBusy ? <Icon name="Loader2" className="h-3.5 w-3.5 animate-spin" /> : <Icon name="PackageOpen" className="h-3.5 w-3.5" />} Export full ZIP
            </button>
            <button className="btn-primary flex-1 text-xs" onClick={importFullZip} disabled={zipBusy}>
              <Icon name="FolderOpen" className="h-3.5 w-3.5" /> Restore from ZIP
            </button>
          </div>
        </div>
      </CardGroup>

      <CardGroup label="All Data">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Export all data (JSON)</div>
            <div className="settings-row-desc">Download a JSON backup of localStorage data</div>
          </div>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={exportAllData}>
            <Icon name="Download" className="h-3.5 w-3.5" /> Export
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title" style={{ color: '#f87171' }}>Delete all data</div>
            <div className="settings-row-desc">Permanently remove all Lithium data from this device</div>
          </div>
          <button
            className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
            onClick={deleteAllData}
          >
            <Icon name="Trash2" className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </CardGroup>
    </div>
  );
}
