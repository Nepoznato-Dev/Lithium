import { useState } from 'react';
import { CardGroup, SettingsRow } from '../controls';
import Icon from '../../../Components/Icon';
import { storage } from '../../../lib/storage';

const AVATAR_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#f87171', '#fb923c', '#facc15', '#60a5fa', '#f472b6'];

export default function ProfilesSection({ settings, update }) {
  const profiles = settings.profiles?.list || [{ id: 'default', name: 'Player', avatar: null }];
  const activeId = settings.profiles?.activeId || 'default';
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState('');

  const startEdit = (profile) => {
    setEditingId(profile.id);
    setDraftName(profile.name);
  };

  const saveEdit = () => {
    if (!draftName.trim()) return;
    const list = profiles.map(p => p.id === editingId ? { ...p, name: draftName.trim() } : p);
    update('profiles.list', list);
    setEditingId(null);
  };

  const addProfile = () => {
    const id = `profile-${Date.now()}`;
    const list = [...profiles, { id, name: `User ${profiles.length + 1}`, avatar: null, pin: null }];
    update('profiles.list', list);
    startEdit(list[list.length - 1]);
  };

  const removeProfile = (id) => {
    if (id === 'default') return;
    if (id === activeId) update('profiles.activeId', 'default');
    const list = profiles.filter(p => p.id !== id);
    update('profiles.list', list);
  };

  const switchTo = (id) => {
    update('profiles.activeId', id);
    storage.set('profile-avatar', profiles.find(p => p.id === id)?.avatar || null);
    window.dispatchEvent(new CustomEvent('lithium:profile-changed', { detail: { profileId: id } }));
  };

  return (
    <div>
      <CardGroup label="Active profile">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          {profiles.map(profile => (
            <div key={profile.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: profile.id === activeId ? 'rgba(34,211,238,0.06)' : 'transparent',
              borderRadius: 6, padding: '8px 10px',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: profile.avatar ? `url(${profile.avatar}) center/cover` : AVATAR_COLORS[profiles.indexOf(profile) % AVATAR_COLORS.length],
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: profile.avatar ? 'transparent' : '#fff',
                flexShrink: 0,
              }}>
                {profile.avatar ? '' : profile.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingId === profile.id ? (
                  <input className="text-input w-full py-1 text-xs" value={draftName} onChange={e => setDraftName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit()} autoFocus />
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: profile.id === activeId ? 600 : 400 }}>{profile.name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{profile.id === activeId ? 'Active' : ''}</div>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {profile.id === activeId ? (
                  <span className="settings-badge on">Active</span>
                ) : (
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => switchTo(profile.id)}>Switch</button>
                )}
                {editingId === profile.id ? (
                  <>
                    <button className="btn-primary px-2 py-1 text-xs" onClick={saveEdit}>Save</button>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditingId(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => startEdit(profile)}><Icon name="Pencil" size={12} /></button>
                )}
                {profile.id !== 'default' && (
                  <button className="btn-ghost px-2 py-1 text-xs" style={{ color: '#ef4444' }} onClick={() => removeProfile(profile.id)}><Icon name="Trash2" size={12} /></button>
                )}
              </div>
            </div>
          ))}
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={addProfile}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="Plus" size={12} /> Add profile</span>
          </button>
        </div>
      </CardGroup>

      <p className="text-[11px] leading-relaxed text-white/30 mt-2 px-1">
        Each profile has its own home directory under /Home/&lt;profile&gt;/ with isolated settings and data.
      </p>
    </div>
  );
}
