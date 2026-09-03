import { useState, useEffect } from 'react';
import { storage } from '../../../lib/storage';
import Icon from '../../../Components/Icon';
import { CardGroup } from '../controls';

export default function ProfileSection({ settings, update }) {
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [avatar, setAvatar] = useState(() => storage.get('profile-avatar', null));

  useEffect(() => {
    const handler = () => setAvatar(storage.get('profile-avatar', null));
    window.addEventListener('lithium:avatar-changed', handler);
    return () => window.removeEventListener('lithium:avatar-changed', handler);
  }, []);

  return (
    <div>
      <CardGroup label="Profile Picture">
        <div className="settings-row">
          {avatar ? (
            <img src={avatar} alt="Profile" className="h-12 w-12 rounded-full border-2 border-white/15 object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
              style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
              {settings.profile.username.charAt(0).toUpperCase() || 'U'}
            </span>
          )}
          <div className="settings-row-info">
            <div className="settings-row-title">Avatar</div>
            <div className="settings-row-desc">Set one from the Photos app (open a photo → user icon)</div>
          </div>
          {avatar && (
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => { storage.remove('profile-avatar'); window.dispatchEvent(new Event('lithium:avatar-changed')); }}>
              Remove
            </button>
          )}
        </div>
      </CardGroup>

      <CardGroup label="Display Name">
        <div className="settings-row">
          {editingUsername ? (
            <div className="flex gap-2 w-full">
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
              <div className="settings-row-info">
                <div className="settings-row-title" style={{ fontSize: 16 }}>{settings.profile.username}</div>
                <div className="settings-row-desc">This name appears in the Start menu and profile</div>
              </div>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => { setEditingUsername(true); setUsernameDraft(settings.profile.username); }}>
                Edit
              </button>
            </>
          )}
        </div>
      </CardGroup>
    </div>
  );
}
