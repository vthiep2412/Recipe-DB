import type { LocalMediaStoreAPI } from '../types/cloud';

const DB_NAME = 'recipedb_local_media';
const DB_VERSION = 1;
const STORE_NAME = 'blobs';

interface BlobRecord {
  key: string;
  blob: Blob;
  createdAt: number;
}

let cachedDbPromise: Promise<IDBDatabase> | null = null;

function getDatabase(): Promise<IDBDatabase> {
  if (cachedDbPromise) {
    return cachedDbPromise;
  }

  cachedDbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        cachedDbPromise = null;
      };
      db.onerror = () => {
        cachedDbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      cachedDbPromise = null;
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });

  return cachedDbPromise;
}

export const localMediaStore: LocalMediaStoreAPI = {
  async saveBlob(key: string, blob: Blob): Promise<void> {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const record: BlobRecord = {
        key,
        blob,
        createdAt: Date.now()
      };
      const request = store.put(record);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async loadBlob(key: string): Promise<Blob | null> {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result as BlobRecord | undefined;
        if (result?.blob) {
          resolve(result.blob);
          return;
        }

        // Resilient fallback for key variations with or without 'idb:' prefix
        const alternateKey = key.startsWith('idb:') ? key.replace(/^idb:/, '') : `idb:${key}`;
        const altRequest = store.get(alternateKey);
        altRequest.onsuccess = () => {
          const altResult = altRequest.result as BlobRecord | undefined;
          resolve(altResult?.blob ?? null);
        };
        altRequest.onerror = () => resolve(null);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async deleteBlob(key: string): Promise<void> {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async clearWorkspace(workspaceId: string): Promise<void> {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const keyStr = String(cursor.key);
          if (keyStr.includes(workspaceId)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }
};
