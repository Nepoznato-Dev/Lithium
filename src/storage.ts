export const storage = {
  get<T>(key: string, fallback: T): T {
    try { const value = localStorage.getItem(`lithium:${key}`); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
  },
  set<T>(key: string, value: T) { localStorage.setItem(`lithium:${key}`, JSON.stringify(value)); },
  remove(key: string) { localStorage.removeItem(`lithium:${key}`); },
  async openDatabase() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lithium', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('data');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
};
