/* ── IndexedDB wrapper ─────────────────────────────────────────────────────── */
const DB_NAME = 'scanner-db';
const DB_VERSION = 1;
const STORE = 'items';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = ({ target: { result: db } }) => {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess  = ({ target: { result } }) => resolve(result);
    req.onerror    = ({ target: { error  } }) => reject(error);
  });
}

const DB = {
  async add(item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite')
                    .objectStore(STORE)
                    .add({ ...item, savedAt: new Date().toISOString() });
      req.onsuccess = ({ target: { result } }) => resolve(result);
      req.onerror   = ({ target: { error  } }) => reject(error);
    });
  },

  async getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = ({ target: { result } }) => resolve([...result].reverse()); // newest first
      req.onerror   = ({ target: { error  } }) => reject(error);
    });
  },

  async delete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = ({ target: { error } }) => reject(error);
    });
  },

  async clear() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror   = ({ target: { error } }) => reject(error);
    });
  }
};
