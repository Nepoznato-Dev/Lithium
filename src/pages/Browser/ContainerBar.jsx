/**
 * ContainerBar — container tab group indicator and switcher (C1).
 * Shows colored pills for each container with active tabs.
 * Clicking a container switches the active container for new tabs.
 */
import { useState } from 'preact/hooks';
import { containers, activeContainer, setActiveContainer, addContainer, removeContainer } from './stores/containerStore';
import { tabs } from './stores/tabStore';
import Icon from '../../Components/Icon';

export default function ContainerBar() {
  const allContainers = containers.value;
  const active = activeContainer.value;
  const allTabs = tabs.value;
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#22d3ee');

  const handleAdd = () => {
    if (!newName.trim()) return;
    addContainer({ name: newName.trim(), color: newColor, icon: 'Globe' });
    setNewName('');
    setShowAdd(false);
  };

  // Count tabs per container
  const tabCounts = {};
  for (const t of allTabs) {
    const cid = t.containerId || 'default';
    tabCounts[cid] = (tabCounts[cid] || 0) + 1;
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: 'rgba(0,0,0,0.15)', overflowX: 'auto',
    }}>
      {allContainers.map(c => (
        <button
          key={c.id}
          onClick={() => setActiveContainer(c.id)}
          title={c.name}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 12, border: 'none',
            background: c.id === active ? `${c.color}22` : 'transparent',
            color: c.id === active ? c.color : 'rgba(255,255,255,0.4)',
            fontSize: 11, fontWeight: c.id === active ? 600 : 400,
            cursor: 'pointer', whiteSpace: 'nowrap',
            borderBottom: c.id === active ? `2px solid ${c.color}` : '2px solid transparent',
            transition: 'all 0.15s',
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: c.color, flexShrink: 0,
          }} />
          <span>{c.name}</span>
          {tabCounts[c.id] > 0 && (
            <span style={{
              fontSize: 9, background: 'rgba(255,255,255,0.08)',
              padding: '0 4px', borderRadius: 6, color: 'rgba(255,255,255,0.3)',
            }}>
              {tabCounts[c.id]}
            </span>
          )}
          {!c.isDefault && (
            <button
              onClick={(e) => { e.stopPropagation(); removeContainer(c.id); }}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', padding: 0, marginLeft: 2 }}
              title="Remove container"
            >
              <Icon name="X" size={9} />
            </button>
          )}
        </button>
      ))}

      {/* Add container */}
      {showAdd ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <input
            className="text-input"
            style={{ width: 80, padding: '2px 6px', fontSize: 10, borderRadius: 6 }}
            placeholder="Name"
            value={newName}
            onInput={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAdd(false); }}
            autoFocus
          />
          <input
            type="color"
            value={newColor}
            onInput={(e) => setNewColor(e.target.value)}
            style={{ width: 18, height: 18, border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
          />
          <button onClick={handleAdd} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer' }}>
            <Icon name="Check" size={12} />
          </button>
          <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
            <Icon name="X" size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)',
            cursor: 'pointer', padding: '3px 6px', borderRadius: 8, fontSize: 12,
          }}
          title="New container"
        >
          <Icon name="Plus" size={12} />
        </button>
      )}
    </div>
  );
}
