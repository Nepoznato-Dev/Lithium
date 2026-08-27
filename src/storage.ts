export const storage = {
  get<T>(key: string, fallback: T): T {
    try { const value = localStorage.getItem(`lithium:${key}`); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
  },
  set<T>(key: string, value: T) { localStorage.setItem(`lithium:${key}`, JSON.stringify(value)); },
  remove(key: string) { localStorage.removeItem(`lithium:${key}`); },
  async openDatabase() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lithium', 1);
      request.onupgradeneeded = () => ['data', 'notes', 'flashcards', 'progress'].forEach(store => { if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath: 'id', autoIncrement: true }); });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async getAll<T>(storeName: string): Promise<T[]> { const db = await this.openDatabase(); return new Promise((resolve, reject) => { const request = db.transaction(storeName).objectStore(storeName).getAll(); request.onsuccess = () => resolve(request.result as T[]); request.onerror = () => reject(request.error); }); },
  async put<T>(storeName: string, value: T) { const db = await this.openDatabase(); return new Promise<IDBValidKey>((resolve, reject) => { const request = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); },
};
