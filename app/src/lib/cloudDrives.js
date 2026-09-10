import { storage } from './storage/localStorage';

/**
 * Cloud drive adapters — mount Google Drive / OneDrive as extra hard drives.
 * Users supply an OAuth access token; drives are browsed through the
 * providers' REST APIs (both support browser CORS).
 */

const KEY = 'cloud-drives';

export function loadDriveConfigs() {
  return storage.get(KEY, []);
}

export function saveDriveConfigs(list) {
  storage.set(KEY, list);
}

/** Assign the next free drive letter (C: is always the local disk). */
export function nextDriveLetter(configs) {
  const used = new Set(['C', ...configs.map(config => config.letter)]);
  for (let code = 68; code <= 90; code += 1) {
    const letter = String.fromCharCode(code);
    if (!used.has(letter)) return letter;
  }
  return 'Z';
}

export const PROVIDERS = {
  gdrive: { label: 'Google Drive', color: '#34a853' },
  onedrive: { label: 'OneDrive', color: '#0078d4' },
};

/** Thrown when the provider rejects the stored OAuth token (401/403). */
export class CloudAuthError extends Error {
  constructor(provider, detail) {
    super(detail || 'Sign-in expired or token invalid');
    this.name = 'CloudAuthError';
    this.provider = provider;
    this.auth = true;
  }
}

function entryType(mime, name) {
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('text/') || mime === 'application/json' || /\.(txt|md|json|csv|log|html?)$/i.test(name || '')) return 'text';
  return 'file';
}

async function request(url, config, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${config.token}`, ...(options.headers || {}) },
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body.error?.message || body.error?.message || '';
    } catch { /* non-JSON error body */ }
    if (response.status === 401 || response.status === 403) {
      throw new CloudAuthError(config.provider, detail);
    }
    throw new Error(detail || `${config.provider} request failed (${response.status})`);
  }
  return response;
}

/** List a folder's children, normalized to { id, name, type, size, mime }. */
export async function listChildren(config, folderId) {
  if (config.provider === 'gdrive') {
    const parent = folderId || 'root';
    const query = encodeURIComponent(`'${parent}' in parents and trashed=false`);
    const response = await request(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size)&pageSize=1000`,
      config
    );
    const data = await response.json();
    return (data.files || [])
      .map(file => ({
        id: file.id,
        name: file.name,
        type: file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : entryType(file.mimeType, file.name),
        size: Number(file.size || 0),
        mime: file.mimeType,
      }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
  }

  const url = folderId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?$top=1000`
    : 'https://graph.microsoft.com/v1.0/me/drive/root/children?$top=1000';
  const response = await request(url, config);
  const data = await response.json();
  return (data.value || [])
    .map(file => ({
      id: file.id,
      name: file.name,
      type: file.folder ? 'folder' : entryType(file.file?.mimeType, file.name),
      size: file.size || 0,
      mime: file.file?.mimeType,
    }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
}

/** Verify the token works by listing the drive root. */
export function testConnection(config) {
  return listChildren(config, null);
}

/** Download a file as a Blob. */
export async function downloadBlob(config, item) {
  const url = config.provider === 'gdrive'
    ? `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`
    : `https://graph.microsoft.com/v1.0/me/drive/items/${item.id}/content`;
  const response = await request(url, config);
  return response.blob();
}

/** Upload a browser File into a folder. */
export async function uploadFile(config, folderId, file) {
  if (config.provider === 'gdrive') {
    const metadata = { name: file.name, parents: [folderId || 'root'] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);
    const response = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', config, {
      method: 'POST',
      headers: {},
      body: form,
    });
    return response.json();
  }

  const base = folderId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}:/${encodeURIComponent(file.name)}:/content`
    : `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(file.name)}:/content`;
  const response = await request(base, config, { method: 'PUT', headers: {}, body: file });
  return response.json();
}

export async function createFolder(config, folderId, name) {
  if (config.provider === 'gdrive') {
    const response = await request('https://www.googleapis.com/drive/v3/files?fields=id', config, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [folderId || 'root'] }),
    });
    return response.json();
  }

  const url = folderId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`
    : 'https://graph.microsoft.com/v1.0/me/drive/root/children';
  const response = await request(url, config, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
  });
  return response.json();
}

export async function renameItem(config, id, name) {
  const url = config.provider === 'gdrive'
    ? `https://www.googleapis.com/drive/v3/files/${id}?fields=id`
    : `https://graph.microsoft.com/v1.0/me/drive/items/${id}`;
  await request(url, config, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function deleteItem(config, id) {
  const url = config.provider === 'gdrive'
    ? `https://www.googleapis.com/drive/v3/files/${id}`
    : `https://graph.microsoft.com/v1.0/me/drive/items/${id}`;
  await request(url, config, { method: 'DELETE' });
}
