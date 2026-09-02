/**
 * Downloads state — tracks active and completed downloads.
 */
import { signal, computed } from '@preact/signals';

/** Download item shape: { id, filename, url, totalBytes, receivedBytes, status, startTime }
 *  status: 'downloading' | 'completed' | 'paused' | 'failed' | 'cancelled'
 */
export const downloads = signal([]);

let downloadCounter = 0;

/** Computed: active (in-progress) downloads. */
export const activeDownloads = computed(() =>
  downloads.value.filter(d => d.status === 'downloading')
);

/** Computed: completed downloads (newest first). */
export const completedDownloads = computed(() =>
  downloads.value.filter(d => d.status === 'completed').sort((a, b) => b.startTime - a.startTime)
);

/* ---------- Actions ---------- */

export function addDownload(filename, url, totalBytes) {
  const item = {
    id: `dl-${++downloadCounter}`,
    filename,
    url,
    totalBytes: totalBytes || 0,
    receivedBytes: 0,
    status: 'downloading',
    startTime: Date.now(),
  };
  downloads.value = [item, ...downloads.value];
  return item.id;
}

export function updateDownloadProgress(id, receivedBytes) {
  downloads.value = downloads.value.map(d => {
    if (d.id !== id) return d;
    const status = d.totalBytes > 0 && receivedBytes >= d.totalBytes ? 'completed' : 'downloading';
    return { ...d, receivedBytes, status };
  });
}

export function completeDownload(id) {
  downloads.value = downloads.value.map(d =>
    d.id === id ? { ...d, status: 'completed', receivedBytes: d.totalBytes } : d
  );
}

export function failDownload(id, error) {
  downloads.value = downloads.value.map(d =>
    d.id === id ? { ...d, status: 'failed', error } : d
  );
}

export function pauseDownload(id) {
  downloads.value = downloads.value.map(d =>
    d.id === id ? { ...d, status: 'paused' } : d
  );
}

export function removeDownload(id) {
  downloads.value = downloads.value.filter(d => d.id !== id);
}

export function clearCompleted() {
  downloads.value = downloads.value.filter(d => d.status !== 'completed');
}

export function loadDownloads(data) {
  downloads.value = data || [];
}
