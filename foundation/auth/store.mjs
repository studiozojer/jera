import { DatabaseSync } from 'node:sqlite';
import { chmodSync } from 'node:fs';

// Single-process service. SQLite transactions consume handoffs before minting;
// a lost response requires a fresh login, never a replayable bearer delivery.
export class AuthStore {
  constructor(path) {
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS kv (space TEXT, key TEXT, value TEXT, expires INTEGER, PRIMARY KEY(space,key));`);
  }
  get(space, key) {
    const row = this.db.prepare('SELECT value FROM kv WHERE space=? AND key=? AND expires>?').get(space, key, Date.now());
    return row ? JSON.parse(row.value) : undefined;
  }
  set(space, key, value, ttl = 30 * 86400000) {
    this.db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?,?,?)').run(space, key, JSON.stringify(value), Date.now() + ttl);
  }
  del(space, key) { this.db.prepare('DELETE FROM kv WHERE space=? AND key=?').run(space, key); }
  insert(space, key, value, ttl) {
    this.prune();
    return this.db.prepare('INSERT OR IGNORE INTO kv VALUES (?,?,?,?)').run(space, key, JSON.stringify(value), Date.now() + ttl).changes === 1;
  }
  prune() { this.db.prepare('DELETE FROM kv WHERE expires<=?').run(Date.now()); }
  sdk(space, ttl) {
    return { get: async key => this.get(space, key), set: async (key, value) => this.set(space, key, value, ttl), del: async key => this.del(space, key) };
  }
  close() { this.db.close(); }
}
