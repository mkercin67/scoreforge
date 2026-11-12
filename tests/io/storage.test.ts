import { describe, expect, it, beforeEach } from 'vitest';
import { createScore } from '../../src/core/factory';
import { clearAutosave, loadAutosave, saveAutosave, STORE_NAME } from '../../src/io/storage';

// Minimal in-memory IndexedDB mock strictly using native types
class MockIDBRequest {
  result: any = null;
  error: any = null;
  onsuccess: any = null;
  onerror: any = null;
  onupgradeneeded: any = null;
}

class MockIDBObjectStore {
  constructor(private store: Map<string, any>) {}
  put(value: any, key?: any) {
    const req = new MockIDBRequest();
    setTimeout(() => {
      const k = key ?? value?.key;
      this.store.set(k, value);
      req.result = k;
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
  get(key: any) {
    const req = new MockIDBRequest();
    setTimeout(() => {
      req.result = this.store.get(key) ?? null;
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
  delete(key: any) {
    const req = new MockIDBRequest();
    setTimeout(() => {
      this.store.delete(key);
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
}

class MockIDBTransaction {
  constructor(private store: Map<string, any>) {}
  objectStore(_name: string) {
    return new MockIDBObjectStore(this.store);
  }
}

class MockIDBDatabase {
  private stores = new Map<string, Map<string, any>>();
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };
  createObjectStore(name: string) {
    const s = new Map<string, any>();
    this.stores.set(name, s);
    return new MockIDBObjectStore(s);
  }
  transaction(name: string, _mode?: string) {
    let s = this.stores.get(name);
    if (!s) {
      s = new Map<string, any>();
      this.stores.set(name, s);
    }
    return new MockIDBTransaction(s);
  }
  close() {}
}

function installMockIndexedDB() {
  const db = new MockIDBDatabase();
  db.createObjectStore(STORE_NAME);

  const mockFactory = {
    open(_name: string, _version?: number) {
      const req = new MockIDBRequest();
      setTimeout(() => {
        req.result = db;
        if (req.onsuccess) req.onsuccess({ target: req });
      }, 0);
      return req;
    },
  };

  (globalThis as any).indexedDB = mockFactory;
}

describe('Milestone 5 Storage (src/io/storage)', () => {
  beforeEach(() => {
    installMockIndexedDB();
  });

  it('saveAutosave writes score with ISO timestamp and loadAutosave retrieves it', async () => {
    const score = createScore({ title: 'Autosave Score', composer: 'Composer A' });
    await saveAutosave(score);

    const loaded = await loadAutosave();
    expect(loaded).not.toBeNull();
    expect(loaded?.score.id).toBe(score.id);
    expect(loaded?.score.meta.title).toBe('Autosave Score');
    expect(typeof loaded?.savedAt).toBe('string');
  });

  it('clearAutosave removes the saved record', async () => {
    const score = createScore({ title: 'Temporary' });
    await saveAutosave(score);
    let loaded = await loadAutosave();
    expect(loaded).not.toBeNull();

    await clearAutosave();
    loaded = await loadAutosave();
    expect(loaded).toBeNull();
  });

  it('degrades gracefully without throwing when indexedDB is undefined', async () => {
    const originalIDB = (globalThis as any).indexedDB;
    try {
      delete (globalThis as any).indexedDB;

      const score = createScore({ title: 'No IDB' });
      await expect(saveAutosave(score)).resolves.not.toThrow();
      await expect(loadAutosave()).resolves.toBeNull();
      await expect(clearAutosave()).resolves.not.toThrow();
    } finally {
      (globalThis as any).indexedDB = originalIDB;
    }
  });
});
