import { useState, useEffect, useRef } from 'react';
import { storage } from '../../../lib/storage';
import Icon from '../../../Components/Icon';
import { CardGroup } from '../controls';

const AVATAR_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#f87171', '#fb923c', '#facc15', '#60a5fa', '#f472b6'];

export default function ProfileSection({ settings, update }) {
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [avatar, setAvatar] = useState(() => storage.get('profile-avatar', null));
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState('');
  const fileInputRef = useRef(null); // eslint-disable-line no-unused-vars

  const profiles = settings.profiles?.list || [{ id: 'default', name: 'Player', avatar: null }];
  const activeId = settings.profiles?.activeId || 'default';
  const activeProfile = profiles.find(p => p.id === activeId) || profiles[0];

  useEffect(() => {
    const handler = () => setAvatar(storage.get('profile-avatar', null));
    window.addEventListener('lithium:avatar-changed', handler);
    return () => window.removeEventListener('lithium:avatar-changed', handler);
  }, []);

  // ── Avatar upload ──────────────────────────────────────────────────────
  const handleAvatarUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        storage.set('profile-avatar', dataUrl);
        setAvatar(dataUrl);
        // Also update the active profile's avatar in the profiles list
        const list = profiles.map(p => p.id === activeId ? { ...p, avatar: dataUrl } : p);
        update('profiles.list', list);
        window.dispatchEvent(new Event('lithium:avatar-changed'));
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const removeAvatar = () => {
    storage.remove('profile-avatar');
    setAvatar(null);
    const list = profiles.map(p => p.id === activeId ? { ...p, avatar: null } : p);
    update('profiles.list', list);
    window.dispatchEvent(new Event('lithium:avatar-changed'));
  };

  // ── Profile list management ────────────────────────────────────────────
  const startEdit = (profile) => {
    setEditingId(profile.id);
    setDraftName(profile.name);
  };

  const saveEdit = () => {
    if (!draftName.trim()) return;
    const list = profiles.map(p => p.id === editingId ? { ...p, name: draftName.trim() } : p);
    update('profiles.list', list);
    if (editingId === activeId) update('profile.username', draftName.trim());
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
    const target = profiles.find(p => p.id === id);
    storage.set('profile-avatar', target?.avatar || null);
    window.dispatchEvent(new CustomEvent('lithium:profile-changed', { detail: { profileId: id } }));
  };

  return (
    <div>
      {/* Active profile hero */}
      <CardGroup label="Active Profile">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {avatar ? (
                <img src={avatar} alt="Profile" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent)' }} />
              ) : (
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: AVATAR_COLORS[profiles.indexOf(activeProfile) % AVATAR_COLORS.length],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 700, color: '#fff',
                  border: '2px solid var(--accent)',
                }}>
                  {(activeProfile?.name || settings.profile.username).charAt(0).toUpperCase()}
                </div>
              )}
              <button
                onClick={handleAvatarUpload}
                style={{
                  position: 'absolute', bottom: -2, right: -2,
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--accent)', border: '2px solid hsl(var(--background))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title="Upload avatar"
              >
                <Icon name="Camera" size={10} style={{ color: '#fff' }} />
              </button>
            </div>

            {/* Name + info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {editingUsername ? (
                <div className="flex gap-2 items-center">
                  <input
                    className="text-input flex-1"
                    value={usernameDraft}
                    maxLength={24}
                    onChange={e => setUsernameDraft(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && usernameDraft.trim() && (update('profile.username', usernameDraft.trim()), setEditingUsername(false))}
                    autoFocus
                  />
                  <button className="btn-primary px-3" disabled={!usernameDraft.trim()} onClick={() => { update('profile.username', usernameDraft.trim()); setEditingUsername(false); }}>
                    <Icon name="Check" className="h-4 w-4" />
                  </button>
                  <button className="btn-ghost px-3" onClick={() => setEditingUsername(false)}>Cancel</button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{settings.profile.username}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    {activeId === 'default' ? 'Local profile' : `Profile: ${activeProfile?.name || 'Unknown'}`}
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {!editingUsername && (
                <button className="settings-edit-btn" onClick={() => { setEditingUsername(true); setUsernameDraft(settings.profile.username); }}>
                  Edit
                </button>
              )}
              {avatar && (
                <button className="btn-ghost px-3 py-1.5 text-xs" onClick={removeAvatar}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </CardGroup>

      {/* All profiles */}
      <CardGroup label="Profiles">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          {profiles.map((profile, idx) => (
            <div key={profile.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: profile.id === activeId ? 'rgba(34,211,238,0.06)' : 'transparent',
              borderRadius: 6, padding: '8px 10px',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: profile.avatar ? `url(${profile.avatar}) center/cover` : AVATAR_COLORS[idx % AVATAR_COLORS.length],
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
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={addProfile} style={{ marginTop: 4 }}>
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
