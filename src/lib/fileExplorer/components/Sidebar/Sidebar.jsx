/**
 * Main sidebar — Quick Access, This PC, Network, cloud drives, storage bar.
 * Extracted from renderSidebar() in the monolith.
 */
import Icon from '../../../../Components/Icon';
import {
  view, nav, pins, thisPCOpen, networkOpen, draggingId,
  cloudItems, cloudLoading, authIssue,
} from '../../state/signals.jsx';
import { childrenOf, getEntry, trashedItems, TRASH_ID, isTrashed } from '../../../fileSystem.js';
import { PROVIDERS } from '../../../cloudDrives.js';
import { IDB_CAP, formatBytes } from '../../../storage/manager.js';
import SideRow from './SideRow.jsx';
import TreeView from './TreeView.jsx';

const QUICK_DEFAULT = ['default-desktop', 'default-downloads', 'default-documents', 'default-pictures', 'default-music', 'default-videos'];

const QUICK_META = {
  Desktop: { icon: 'Monitor', color: '#38bdf8' },
  Downloads: { icon: 'Download', color: '#22c55e' },
  Documents: { icon: 'FileText', color: '#60a5fa' },
  Pictures: { icon: 'Image', color: '#38bdf8' },
  Music: { icon: 'Music', color: '#f472b6' },
  Videos: { icon: 'Film', color: '#a78bfa' },
};

export default function Sidebar({ tree, configs, updateConfigs, openMenu, goDrive, togglePin, dropTarget, setStorageOpen, setConnectOpen }) {
  const folderId = nav.value.stack[nav.value.stack.length - 1]?.id;

  return (
    <aside className="flex w-52 shrink-0 flex-col overflow-y-auto border-r border-black/40 bg-[#1f1f23] p-1.5">
      <SideRow icon="Home" color="#f59e0b" label="Home" active={view.value === 'home'} onClick={() => { view.value = 'home'; }} />
      <SideRow icon="Image" color="#38bdf8" label="Gallery" active={view.value === 'gallery'} onClick={() => { view.value = 'gallery'; }} />
      <SideRow
        icon="Trash"
        color="#9ca3af"
        label="Recycle Bin"
        active={view.value === 'files' && nav.value.driveId === 'local' && (folderId === TRASH_ID || (getEntry(tree, folderId) && isTrashed(getEntry(tree, folderId))))}
        onClick={() => { view.value = 'files'; nav.value = { driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, { id: TRASH_ID, name: 'Recycle Bin' }] }; }}
        right={trashedItems(tree).length > 0 ? <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-white/55">{trashedItems(tree).length}</span> : null}
      />
      {configs.filter(c => c.provider === 'onedrive').map(config => (
        <SideRow key={config.id} icon="Cloud" color={PROVIDERS.onedrive.color} label={config.label} active={view.value === 'files' && nav.value.driveId === config.id} onClick={() => goDrive(config.id)} />
      ))}

      <div className="mx-2 my-2 h-px bg-white/[0.08]" />

      {[...pins.value]
        .sort((a, b) => {
          const ia = QUICK_DEFAULT.indexOf(a);
          const ib = QUICK_DEFAULT.indexOf(b);
          return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        })
        .map(id => {
          const folder = getEntry(tree, id);
          if (!folder) return null;
          const meta = QUICK_META[folder.name] || { icon: 'Folder', color: '#f59e0b' };
          return (
            <SideRow
              key={id}
              icon={meta.icon}
              color={meta.color}
              label={folder.name}
              active={view.value === 'files' && nav.value.driveId === 'local' && folderId === id}
              onClick={() => {
                view.value = 'files';
                nav.value = { driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, { id, name: folder.name }] };
              }}
              onContextMenu={event => openMenu(event, [
                { id: 'open', label: 'Open', icon: 'Folder', action: () => { view.value = 'files'; nav.value = { driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, { id, name: folder.name }] }; } },
                { id: 'sep', type: 'separator' },
                { id: 'unpin', label: 'Remove from Quick access', icon: 'Pin', action: () => togglePin(id) },
              ])}
              {...dropTarget(id)}
              right={
                <button
                  className="text-white/25 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                  title="Unpin from Quick access"
                  onClick={event => { event.stopPropagation(); pins.value = pins.value.filter(p => p !== id); }}
                >
                  <Icon name="Pin" size={12} className="rotate-45" />
                </button>
              }
            />
          );
        })}

      <div className="mx-2 my-2 h-px bg-white/[0.08]" />

      <SideRow icon="Monitor" color="#38bdf8" label="This PC" chevron={thisPCOpen.value} onChevron={() => thisPCOpen.value = !thisPCOpen.value} onClick={() => thisPCOpen.value = !thisPCOpen.value} />
      {thisPCOpen.value && (
        <>
          <SideRow indent icon="HardDrive" color="#9ca3af" label="Local Disk (C:)" active={view.value === 'files' && nav.value.driveId === 'local' && nav.value.stack.length === 1} onClick={() => goDrive('local')} {...dropTarget('root')} dropActive={Boolean(draggingId.value)} />
          {configs.map(config => (
            <SideRow
              key={config.id}
              indent
              icon="HardDrive"
              color={PROVIDERS[config.provider]?.color || '#9ca3af'}
              label={`${config.label} (${config.letter}:)`}
              active={view.value === 'files' && nav.value.driveId === config.id}
              onClick={() => goDrive(config.id)}
            />
          ))}
        </>
      )}

      <SideRow icon="Network" color="#38bdf8" label="Network" chevron={networkOpen.value} onChevron={() => networkOpen.value = !networkOpen.value} onClick={() => networkOpen.value = !networkOpen.value} />
      {networkOpen.value && (
        <>
          {configs.map(config => (
            <SideRow
              key={config.id}
              indent
              icon="Cloud"
              color={PROVIDERS[config.provider]?.color}
              label={`${config.label} (${config.letter}:)`}
              active={view.value === 'files' && nav.value.driveId === config.id}
              onClick={() => goDrive(config.id)}
              right={
                <button className="text-white/25 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100" title="Disconnect" onClick={event => { event.stopPropagation(); updateConfigs(configs.filter(e => e.id !== config.id)); }}>
                  <Icon name="X" size={12} />
                </button>
              }
            />
          ))}
          <SideRow indent icon="Plus" color="#22d3ee" label="Connect cloud storage…" onClick={() => setConnectOpen(true)} />
        </>
      )}

      <div className="mt-auto px-2 pb-1 pt-3">
        <button className="w-full text-left" onClick={() => setStorageOpen(true)} title="Open storage manager">
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(100, 1)}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-white/35">
            Storage manager
          </div>
        </button>
      </div>
    </aside>
  );
}
