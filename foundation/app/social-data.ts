// Durable local drafts and posting intents; authoritative records/ACLs live in Snapback.
// The host filesystem is account+origin scoped. A network timeout never means sent.
export type Mode = 'private' | 'public';
export type PostRecord = { id: string; author: string; body: string; visibility: Mode; audience: string | null; parent: string | null; root: string | null; at: number; intent: string };
export type Posting = { intent: string; body: string; visibility: Mode; audience: string | null; parent: string | null; draftDevice?: string; draftRevision?: number; draftScope?: string };
export type Draft = { body: string; revision: number; intent: string; sealed: Posting | null; syncedRevision?: number; cloudRevision?: number };
type Vault = { version: 1; principal: string; origin: string; mode: Mode; device: string; drafts: Record<string, Draft> };
export type Files = { readFile(path: string): Promise<ArrayBuffer>; atomicWriteFile(path: string, data: Uint8Array): Promise<unknown>; readdir(path: string): Promise<string[]> };
export type Request = (kind: 'q' | 'm', operation: string, args: Record<string, unknown>, id?: string) => Promise<any>;
const queues = new Map<string, Promise<unknown>>();
export function newIntent(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Encode 128 random bits in the server's 26-character Crockford alphabet.
  let value = 0n; for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; let result = '';
  for (let i = 0; i < 26; i++) { result = alphabet[Number(value & 31n)] + result; value >>= 5n; }
  return result;
}
export const draftScope = (mode: Mode, parent: string) => parent ? `reply:${parent}` : `root:${mode}`;
function emptyDraft(): Draft { return { body: '', revision: 0, intent: newIntent(), sealed: null }; }
export class Drafts {
  constructor(private fs: Files, readonly origin: string, readonly principal: string) {
    if (!/^did:(plc|web):/.test(principal)) throw new Error('Sign in before opening drafts.');
  }
  private async path() {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.origin + '\n' + this.principal)));
    return 'app:/data/jera-social-' + [...hash].map(x => x.toString(16).padStart(2, '0')).join('') + '.json';
  }
  async use<T>(work: (vault: Vault) => T | Promise<T>, save = false): Promise<T> {
    const path = await this.path();
    const previous = queues.get(path) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const names = await this.fs.readdir('app:/data');
      let vault: Vault = {version:1, principal:this.principal, origin:this.origin, mode:'private', device:newIntent(), drafts:{}};
      const existed=names.includes(path.slice(path.lastIndexOf('/')+1));
      if (existed) {
        vault = JSON.parse(new TextDecoder().decode(await this.fs.readFile(path)));
        if (vault.version !== 1 || vault.principal !== this.principal || vault.origin !== this.origin || !['public','private'].includes(vault.mode) || !vault.drafts || typeof vault.drafts !== 'object') throw new Error('Could not restore this account’s drafts. Existing data was kept.');
      }
      const needsDevice = !vault.device;
      if (needsDevice) vault.device = newIntent();
      const result = await work(vault);
      if (save || needsDevice || !existed) await this.fs.atomicWriteFile(path, new TextEncoder().encode(JSON.stringify(vault)));
      return result;
    });
    queues.set(path, next);
    try { return await next; } finally { if (queues.get(path) === next) queues.delete(path); }
  }
  get(scope: string) { return this.use(v => v.drafts[scope] ?? emptyDraft()); }
  save(scope: string, body: string, revision: number) {
    if (body.length > 12000 || !Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid draft.');
    return this.use(v => {
      const old = v.drafts[scope] ?? emptyDraft();
      if (old.sealed) throw new Error('Confirm the pending post before changing its text.');
      if (revision > old.revision) v.drafts[scope] = {...old, body, revision};
      return v.drafts[scope] ?? old;
    }, true);
  }
  device() { return this.use(v => v.device); }
  mode() { return this.use(v => v.mode); }
  setMode(mode: Mode) {
    if (!['public','private'].includes(mode)) throw new Error('Unknown experience.');
    return this.use(v => {v.mode=mode; return mode;}, true);
  }
}
export async function allRows(request: Request, operation: string, args: Record<string, unknown> = {}) {
  const rows: any[] = [], seen = new Set<string>(); let c: string | null = null;
  do {
    const response = await request('q', operation, {...args, ...(c ? {c} : {})});
    if (!Array.isArray(response.data)) throw new Error('The server did not return a readable page.');
    rows.push(...response.data);
    if (rows.length > 5000) throw new Error('This view needs pagination before more posts can be loaded.');
    c = response.next ?? null;
    if (c) { if (seen.has(c)) throw new Error('The server repeated a page.'); seen.add(c); }
  } while (c);
  return rows;
}
export async function publish(request: Request, drafts: Drafts, mode: Mode, parent: string, revision: number) {
  const scope = draftScope(mode, parent);
  // Seal the exact payload before sending. A retry after a lost response uses
  // the same intent, audience and bytes, even after a process restart.
  let draft = await drafts.get(scope);
  if (!draft.sealed) {
    if (draft.revision !== revision || !draft.body.trim()) throw new Error('Wait for your draft to finish saving.');
    let audience: string | null = null;
    if (parent) {
      const p = (await request('q', 'postById', {id:parent})).data as PostRecord | null;
      if (!p) throw new Error('This conversation is no longer available. Your draft is kept.');
      if (p.visibility === 'private') {
        if (mode !== 'private') throw new Error('Replies to private posts must stay private.');
        audience=p.audience;
      }
    }
    if (mode === 'private' && !audience) {
      const response = await request('m','ensureAudience',{},newIntent());
      if (response.state !== 'sent' || !response.result?.id) throw new Error('Could not prepare your private audience. Your draft is kept.');
      audience=response.result.id;
    }
    const payload: Posting = {intent:draft.intent, body:draft.body, visibility:mode, audience, parent:parent||null, draftDevice:await drafts.device(), draftRevision:draft.cloudRevision||0, draftScope:scope};
    draft=await drafts.use(v => {
      const current=v.drafts[scope];
      if (!current || current.revision !== revision || current.body !== payload.body) throw new Error('The draft changed before posting.');
      if (!current.sealed) {payload.draftRevision=current.cloudRevision||0;current.sealed=payload;}
      return current;
    },true);
  }
  const payload=draft.sealed!;
  try {
    const response=await request('m','publishPost',payload,payload.intent);
    if (response.state === 'failed') {
      await drafts.use(v => {const d=v.drafts[scope]; if(d?.sealed?.intent===payload.intent){d.sealed=null;d.intent=newIntent();}},true);
      throw Object.assign(new Error(response.why?.message || 'Could not post. Your draft is kept.'), {definite:true});
    }
    if (response.state !== 'sent') return {state:'pending',id:'',visibility:payload.visibility,parent:parent};
    const post = response.result?.id ? response.result : (await request('q','postForIntent',{intent:payload.intent})).data;
    if (!post?.id) return {state:'pending',id:'',visibility:payload.visibility,parent:parent};
    if (post.author !== drafts.principal || post.intent !== payload.intent || post.body !== payload.body || post.parent !== payload.parent || post.visibility !== payload.visibility || post.audience !== payload.audience) throw new Error('Could not verify the posted result.');
    await drafts.use(v => {const d=v.drafts[scope];if(d?.sealed?.intent===payload.intent)v.drafts[scope]={body:'',revision:d.revision+1,intent:newIntent(),sealed:null,syncedRevision:payload.draftDevice?d.revision+1:0,cloudRevision:(payload.draftRevision||0)+1};},true);
    return {state:'sent',id:post.id as string,visibility:payload.visibility,parent:parent};
  } catch(error) {
    if ((error as {definite?:boolean}).definite) throw error;
    return {state:'pending',id:'',visibility:payload.visibility,parent:parent};
  }
}

// Cloud rows are authoritative private draft copies. The local journal retains
// unconfirmed edits. Network I/O stays outside the file queue so typing can save
// immediately even when a cloud request is slow or offline.
export async function syncScope(request: Request, drafts: Drafts, scope: string) {
  const device=await drafts.device();
  let local=await drafts.get(scope);
  const priorRevision=local.revision;
  if (local.sealed) return {draft:local,priorRevision};
  if (local.revision===0 && !local.body) {
    const own=(await request('q','draftForDevice',{deviceKey:device,scope})).data;
    const latest=own || (await request('q','latestDraft',{scope})).data?.[0];
    if(latest) {
      local=await drafts.use(v=>{
        const current=v.drafts[scope]||emptyDraft();
        if(current.revision===0 && !current.body && !current.sealed) {
          // Cloud and editor revisions have different jobs. Pulling must not
          // advance the editor's counter while its user is already typing.
          v.drafts[scope]={...current,body:latest.body,syncedRevision:0,cloudRevision:own?latest.revision:0};
        }
        return v.drafts[scope]||current;
      },true);
    }
  }
  if(local.revision>(local.syncedRevision||0) && !local.sealed) {
    const sending=await drafts.use(v=>{
      const d=v.drafts[scope];
      if(!d||d.sealed||d.revision<=(d.syncedRevision||0))return null;
      // Reserve before networking so publication can tombstone all outstanding
      // saves, even one whose response has not arrived yet.
      d.cloudRevision=(d.cloudRevision||0)+1;
      return {body:d.body,editorRevision:d.revision,cloudRevision:d.cloudRevision};
    },true);
    if(sending){
      const response=await request('m','saveSocialDraft',{deviceKey:device,scope,body:sending.body,revision:sending.cloudRevision},newIntent());
      if(response.state!=='sent'||!response.result)throw new Error('Draft sync is waiting for a connection.');
      await drafts.use(v=>{const d=v.drafts[scope];if(d){d.cloudRevision=Math.max(d.cloudRevision||0,response.result.revision);if(d.revision===sending.editorRevision&&d.body===sending.body&&response.result.body===sending.body)d.syncedRevision=sending.editorRevision;}},true);
      if(response.result.body!==sending.body){const current=await drafts.get(scope);if(current.body!==response.result.body)throw new Error('A newer cloud draft was kept; your local copy is preserved too.');}
    }
  }
  return {draft:await drafts.get(scope),priorRevision};
}
export async function syncDrafts(request: Request, drafts: Drafts) {
  const scopes=await drafts.use(v=>Object.keys(v.drafts).filter(key=>{const d=v.drafts[key];return !d.sealed && d.revision>(d.syncedRevision||0);}));
  for(const scope of scopes)await syncScope(request,drafts,scope);
  return scopes.length;
}
