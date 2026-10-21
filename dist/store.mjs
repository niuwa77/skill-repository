import { initialState, migrateState, now } from './core.mjs';
const DATABASE = 'skill-vault-local';
const STORE = 'vault';
export class VaultStore {
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('请关闭其他旧版本页面，再重新打开。'));
      request.onsuccess = () => resolve(request.result);
    });
    this.db.onversionchange = () => {this.db.close(); location.reload();};
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(DATABASE) : null;
    return this.read();
  }
  async read() {
    return new Promise((resolve,reject) => {
      const transaction = this.db.transaction(STORE, 'readwrite');
      const request = transaction.objectStore(STORE).get('state');
      let result;
      request.onsuccess = () => {
        result = request.result || initialState();
        if (request.result && result.uiVersion !== 2) {
          result = migrateState(result);
          result.revision = (result.revision || 0) + 1;
          transaction.objectStore(STORE).put(result,'state');
        }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error('本地数据升级未完成，原数据已保留。'));
      request.onerror = () => reject(request.error);
    });
  }
  async change(expectedRevision, mutate) {
    const result = await new Promise((resolve,reject) => {
      const transaction = this.db.transaction(STORE, 'readwrite');
      const bucket = transaction.objectStore(STORE);
      let next, problem;
      const request = bucket.get('state');
      request.onsuccess = () => {
        try {
          const current = request.result || initialState();
          if (current.revision !== expectedRevision) throw new Error('另一页面已更新数据。请关闭当前弹窗，核对新内容后再操作。');
          next = mutate(structuredClone(current)) || current;
          next.revision = current.revision + 1;
          next.updatedAt = now();
          bucket.put(next,'state');
        } catch (e) {problem = e; transaction.abort();}
      };
      transaction.oncomplete = () => resolve(next);
      transaction.onabort = () => reject(problem || transaction.error || new Error('数据未能保存，请重试。'));
      transaction.onerror = () => {};
    });
    this.channel?.postMessage({revision:result.revision});
    return result;
  }
}
