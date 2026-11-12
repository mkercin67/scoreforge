/**
 * IndexedDB storage management for ScoreForge autosave and recovery.
 *
 * All operations are wrapped in try/catch to degrade gracefully if
 * IndexedDB is unavailable or restricted (e.g. private browsing mode).
 */

import { Score } from '../core/model';

export const AUTOSAVE_KEY = 'autosave:current';
export const DB_NAME = 'scoreforge_db';
export const DB_VERSION = 1;
export const STORE_NAME = 'scores';

export interface AutosaveRecord {
  key: string;
  savedAt: string; // ISO 8601 string
  score: Score;
}

/** Opens or initializes the ScoreForge IndexedDB database. */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Saves the current score to IndexedDB under the autosave key.
 *
 * @param score - The score state to persist.
 * @returns Promise that resolves when written, or resolves safely on error.
 */
export async function saveAutosave(score: Score): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record: AutosaveRecord = {
          key: AUTOSAVE_KEY,
          savedAt: new Date().toISOString(),
          score,
        };
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve(); // Degrade gracefully
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // Degrade gracefully
    return;
  }
}

/**
 * Loads the autosaved score from IndexedDB, if present.
 *
 * @returns The saved record or null if not found or on error.
 */
export async function loadAutosave(): Promise<AutosaveRecord | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(AUTOSAVE_KEY);
        req.onsuccess = () => {
          const res = req.result as AutosaveRecord | undefined;
          resolve(res && res.score ? res : null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

/**
 * Clears the autosaved score from IndexedDB.
 */
export async function clearAutosave(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(AUTOSAVE_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    return;
  }
}
