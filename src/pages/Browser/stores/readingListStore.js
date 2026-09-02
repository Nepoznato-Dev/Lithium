/**
 * Reading list store — save pages for later reading.
 * Signal-based store with localStorage persistence.
 */
import { signal } from '@preact/signals';

/** Reading list items: { url, title, addedAt, read } */
export const readingList = signal([]);

export function addToReadingList(url, title) {
  if (!url) return;
  const exists = readingList.value.some(item => item.url === url);
  if (exists) return;
  readingList.value = [
    { url, title: title || url, addedAt: Date.now(), read: false },
    ...readingList.value,
  ];
}

export function removeFromReadingList(url) {
  readingList.value = readingList.value.filter(item => item.url !== url);
}

export function markAsRead(url) {
  readingList.value = readingList.value.map(item =>
    item.url === url ? { ...item, read: true } : item
  );
}

export function markAsUnread(url) {
  readingList.value = readingList.value.map(item =>
    item.url === url ? { ...item, read: false } : item
  );
}

export function clearReadingList() {
  readingList.value = [];
}

export function loadReadingList(data) {
  if (Array.isArray(data)) readingList.value = data;
}
