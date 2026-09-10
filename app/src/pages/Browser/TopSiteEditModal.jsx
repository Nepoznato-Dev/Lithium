/**
 * TopSiteEditModal — modal dialog for adding or editing a top site tile.
 * Two inputs: Title and URL. Auto-adds https:// if protocol is missing.
 * Used for both "Add new" (null site) and "Edit existing" (pre-filled).
 */
import { useState, useEffect } from 'preact/hooks';

function parseURL(url) {
  try { return new URL(url); } catch { return null; }
}

function maybeAddProtocol(url) {
  if (!parseURL(url)) {
    const https = `https://${url}`;
    if (parseURL(https)) return https;
  }
  return url;
}

export default function TopSiteEditModal({ site, isOpen, onSave, onClose }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTitle(site?.title || '');
      setUrl(site?.url || '');
    }
  }, [isOpen, site]);

  const isValid = title.trim() && !!parseURL(maybeAddProtocol(url));

  const handleSave = () => {
    if (!isValid) return;
    onSave(maybeAddProtocol(url.trim()), title.trim());
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && isValid) handleSave();
  };

  if (!isOpen) return null;

  return (
    <div className="ntp-modal-backdrop" onClick={onClose}>
      <div className="ntp-edit-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKey}>
        <h4 className="ntp-edit-modal-title">
          {site ? 'Edit Shortcut' : 'Add Shortcut'}
        </h4>
        <label className="ntp-edit-label">Name</label>
        <input
          className="ntp-edit-input"
          value={title}
          onInput={e => setTitle(e.target.value)}
          placeholder="Example"
          autoFocus
        />
        <label className="ntp-edit-label">URL</label>
        <input
          className="ntp-edit-input"
          value={url}
          onInput={e => setUrl(e.target.value)}
          placeholder="https://example.com"
        />
        <div className="ntp-edit-actions">
          <button className="ntp-edit-cancel" onClick={onClose}>Cancel</button>
          <button
            className="ntp-edit-save"
            disabled={!isValid}
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
