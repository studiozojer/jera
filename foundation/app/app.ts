import type { Answer, Result, Sources, Store, Storage, NativeModule } from './app.contract.d.ts';
import { Snapback, hasData, refused, type Read, type Sent } from './snapback4/snapback.ts';
import { api } from './backend/api.ts';

const origin = 'http://127.0.0.1:4417';
export const appId = 'studio.zojer.jera.exact';
// Exact rewrites origin when baking. Never share credentials or drafts across servers.
function storageKey(value: string): string {
  if (value === 'https://snapback.jera.ink') return 'jera-https-snapback-jera-ink';
  if (value === 'http://127.0.0.1:4417') return 'jera-http-127.0.0.1-4417';
  throw new Error('Unconfigured Jera backend: add an origin-specific storage key and grant before using it.');
}
const sessionKey = storageKey(origin);
export const grants = `net.fetch ${origin}\nsqlite.open app:/data\nsecret.keep jera-http-127.0.0.1-4417\nsecret.keep jera-https-snapback-jera-ink\nfs.read app:/data\nfs.write app:/data`;

function reject(code: string, message: string): never { throw refused({ code, message }); }
async function using<T>(store: Store, storage: Storage, native: NativeModule | null | undefined, now: number, fn: (db: Snapback) => Promise<T>): Promise<T> {
  const db = await Snapback.open({ app: appId, name: sessionKey, origin, storage, native, auth: { store, key: sessionKey, now } });
  try { return await fn(db); } finally { await db.close(); }
}
function identity(db: Snapback, expected?: string): string {
  const principal = db.session?.principal;
  if (!principal || (expected !== undefined && expected !== principal)) reject('E_AUTH', 'Sign in again before continuing.');
  return principal;
}
function rows<T>(read: Read<T>): T {
  if (!hasData(read)) throw refused(read.denied ?? { code: 'E_OFFLINE', message: 'This view is unavailable. Reconnect and refresh.' });
  return read.data;
}
function ack(fate: Sent<{ id: string }>): Result<'createArmillary'> {
  if (fate.state === 'failed') throw refused(fate.why);
  return { state: fate.state === 'sent' ? 'sent' : 'pending', id: fate.result?.id ?? '' };
}

// Each file is scoped to the endpoint, account and module. Serialize saves and
// submission so an in-flight keystroke cannot overwrite the captured draft.
type DraftFile = { seq: number; body: string; source: string; submitted: boolean };
const draftJobs = new Map<string, Promise<unknown>>();
function draftPath(principal: string, module: string): string {
  return `app:/data/draft-${sessionKey}-${encodeURIComponent(principal)}-${encodeURIComponent(module)}.json`;
}
async function locked<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const previous = draftJobs.get(path) ?? Promise.resolve();
  const job = previous.catch(() => undefined).then(fn);
  draftJobs.set(path, job);
  try { return await job; } finally { if (draftJobs.get(path) === job) draftJobs.delete(path); }
}
function localIdentity(store: Store, expected: string): void {
  const raw = store.get(sessionKey);
  if (!raw || JSON.parse(raw).principal !== expected || !expected) reject('E_AUTH', 'Sign in again before continuing.');
}
async function readDraft(storage: Storage, path: string): Promise<DraftFile> {
  let bytes: ArrayBuffer;
  try { bytes = await storage.fs.readFile(path); }
  catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return { seq: 0, body: '', source: '', submitted: false };
    throw error;
  }
  const value = JSON.parse(new TextDecoder().decode(bytes)) as DraftFile;
  if (!Number.isSafeInteger(value.seq) || value.seq < 0 || typeof value.body !== 'string' || typeof value.source !== 'string' || typeof value.submitted !== 'boolean') {
    reject('E_DRAFT', 'This draft could not be read. Its file has been preserved.');
  }
  return value;
}
async function writeDraft(storage: Storage, path: string, draft: DraftFile): Promise<void> {
  await storage.fs.atomicWriteFile(path, new TextEncoder().encode(JSON.stringify(draft)));
}

const sources: Sources = {
  restore: ([now], store, storage, native) => using(store, storage, native, now, async db => ({ principal: db.session?.principal ?? '' })),
  signup: ([email, password, now], store, storage, native) => using(store, storage, native, now, async db => {
    const result = await db.signup(email.trim(), password);
    if (!result.ok) throw refused(result.why);
    return { state: 'sent', id: result.session.principal };
  }),
  login: ([email, password, now], store, storage, native) => using(store, storage, native, now, async db => {
    const result = await db.login(email.trim(), password);
    if (!result.ok) throw refused(result.why);
    return { state: 'sent', id: result.session.principal };
  }),
  logout: ([now], store, storage, native) => using(store, storage, native, now, async db => {
    await db.logout(); return { state: 'sent', id: '' };
  }),
  armillaries: async ([principal, now], store, storage, native) => {
    if (!principal) return { principal, parent: "", items: [], complete: true, available: true };
    return using(store, storage, native, now, async db => {
      identity(db, principal); await db.sync();
      const page = await db.read(api.armillariesList, {}, now);
      if (page.denied?.code === "E_OFFLINE" || (!hasData(page) && page.offline)) return { principal, parent: "", available: false, items: [], complete: false };
      return { principal, parent: "", available: true, items: rows(page).map(({ id, name }) => ({ id, name })), complete: page.complete === true && !page.next };
    });
  },
  modules: async ([principal, armillary, now], store, storage, native) => {
    if (!principal || !armillary) return { principal, parent: armillary, items: [], complete: true, available: true };
    return using(store, storage, native, now, async db => {
      identity(db, principal); await db.sync();
      const page = await db.read(api.modulesList, { armillary }, now);
      if (page.denied?.code === "E_OFFLINE" || (!hasData(page) && page.offline)) return { principal, parent: armillary, available: false, items: [], complete: false };
      return { principal, parent: armillary, available: true, items: rows(page).map(({ id, name }) => ({ id, name })), complete: page.complete === true && !page.next };
    });
  },
  board: async ([principal, module, now], store, storage, native) => {
    if (!principal || !module) return { principal, module, ideas: [], nodes: [], complete: true };
    return using(store, storage, native, now, async db => {
      identity(db, principal); await db.sync();
      const membership = rows(await db.read(api.membersList, { module }, now));
      if (!membership.some(m => m.principal === principal)) reject('E_ACCESS', 'This module is unavailable to this account.');
      const artifacts = await db.read(api.artifactsList, { module }, now);
      const nodes = await db.read(api.nodesList, { module }, now);
      const tasks = await db.read(api.tasksList, { module }, now);
      const work = rows(tasks);
      return { principal, module,
        ideas: rows(artifacts).map(a => ({ id: a.id, body: a.body, source: a.source, status: a.pending ? 'Queued on this device' : (work.find(t => t.artifact === a.id)?.status ?? 'Work status outside this page') })),
        nodes: rows(nodes).map(n => ({ id: n.id, title: n.title, body: n.body, artifact: n.artifact })),
        complete: [artifacts, nodes, tasks].every(p => p.complete === true && !p.next),
      };
    });
  },
  createArmillary: ([name, now], store, storage, native) => using(store, storage, native, now, async db => {
    identity(db); return ack(await db.send(api.createArmillary, { name }, now));
  }),
  createModule: ([armillary, name, now], store, storage, native) => using(store, storage, native, now, async db => {
    identity(db); return ack(await db.send(api.createModule, { armillary, name }, now));
  }),
  loadDraft: async ([principal, module], store, storage) => {
    if (!principal || !module) return { principal, module, seq: 0, body: '', source: '', submitted: false };
    const session = store.get(sessionKey);
    // A sign-out can invalidate this resource before its old arguments retire.
    if (!session || JSON.parse(session).principal !== principal) return { principal: "", module: "", seq: 0, body: "", source: "", submitted: false };
    const path = draftPath(principal, module);
    return locked(path, async () => ({ principal, module, ...await readDraft(storage, path) }));
  },
  saveDraft: async ([principal, module, body, source], store, storage) => {
    localIdentity(store, principal);
    const path = draftPath(principal, module);
    return locked(path, async () => {
      const draft = await readDraft(storage, path);
      if (draft.submitted) reject('E_PENDING', 'Check delivery before editing this idea.');
      await writeDraft(storage, path, { ...draft, body, source });
      return { state: 'saved', id: '' };
    });
  },
  capture: async ([principal, module, body, source, now], store, storage, native) => {
    const path = draftPath(principal, module);
    return locked(path, () => using(store, storage, native, now, async db => {
      identity(db, principal);
      const draft = await readDraft(storage, path);
      if (draft.body !== body || draft.source !== source) reject('E_DRAFT', 'Wait for your draft to save before capturing it.');
      if (!body.trim()) reject('E_EMPTY', 'Add an idea first.');
      await writeDraft(storage, path, { ...draft, submitted: true });
      // Stable through reload, offline retries and a lost acknowledgement.
      const fate = await db.send(api.capture, { module, body, source }, now, `capture:${module}:${draft.seq}`);
      if (fate.state === 'sent') {
        await writeDraft(storage, path, { seq: draft.seq + 1, body: '', source: '', submitted: false });
      } else if (fate.state === 'failed') {
        await writeDraft(storage, path, { ...draft, seq: draft.seq + 1, submitted: false });
      }
      return ack(fate);
    }));
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
