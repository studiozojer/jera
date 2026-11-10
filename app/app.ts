import type { Answer, Sources, Store, Storage, NativeModule } from './app.contract.d.ts';
import { Snapback, refused } from './snapback4/snapback.ts';
import { parseLoginInput } from './login-input.ts';
import { loadAccountProfile, readCachedAccountProfile } from './account-profile.ts';
import { Drafts, beginDraft, allRows, draftScope, publish, newIntent, syncScope, syncDrafts, type Mode, type PostRecord, type Request } from './social-data.ts';
import { formFields, editedComposition, type Field } from './composition.ts';
import { accountExperience } from './experience-store.ts';
import { preparePrivateWriting } from './private-writing.ts';
import { selectedView, writingPolicy, viewChoices, selectPosts, prepareViewDraft, assertDraftContext, adoptLegacyPublicReply } from './view-context.ts';
import { earlierPublicDrafts, copyEarlierPublicDraft } from './earlier-drafts.ts';

const origin = 'http://127.0.0.1:4417';
export const appId = 'studio.zojer.jera.exact';
// Exact rewrites origin when baking. Never share credentials or drafts across servers.
function storageKey(value: string): string {
  if (value === 'https://snapback.jera.ink') return 'jera-https-snapback-jera-ink';
  if (value === 'http://127.0.0.1:4417') return 'jera-http-127.0.0.1-4417';
  // Explicit loopback bindings isolate concurrent worktree verification.
  if (value === 'http://127.0.0.1:4437') return 'jera-http-127.0.0.1-4437';
  if (value === 'http://127.0.0.1:4457') return 'jera-http-127.0.0.1-4457';
  if (value === 'http://127.0.0.1:4477') return 'jera-http-127.0.0.1-4477';
  throw new Error('Unconfigured Jera backend: add an origin-specific storage key and grant before using it.');
}
const sessionKey = storageKey(origin) + '-atproto-v1';
const pendingKey = sessionKey + '-login';
export const grants = `net.fetch ${origin}\nnet.fetch https://public.api.bsky.app\nnet.fetch https://cdn.bsky.app\nauth.session ${origin}\nauth.callback studio.zojer.jera.exact:/oauth\nauth.callback https://jera.ink/.exact/auth/callback\nsqlite.open app:/data\nsecret.keep jera-http-127.0.0.1-4417-atproto-v1\nsecret.keep jera-http-127.0.0.1-4437-atproto-v1\nsecret.keep jera-http-127.0.0.1-4457-atproto-v1\nsecret.keep jera-http-127.0.0.1-4477-atproto-v1\nsecret.keep jera-https-snapback-jera-ink-atproto-v1\nsecret.keep jera-http-127.0.0.1-4417-atproto-v1-login\nsecret.keep jera-http-127.0.0.1-4437-atproto-v1-login\nsecret.keep jera-http-127.0.0.1-4457-atproto-v1-login\nsecret.keep jera-http-127.0.0.1-4477-atproto-v1-login\nsecret.keep jera-https-snapback-jera-ink-atproto-v1-login\nfs.read app:/data\nfs.write app:/data`;

function randomToken(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function prepareLogin(store: Store, replace = false): Promise<void> {
  if (!replace && store.get(pendingKey)) return;
  const verifier = randomToken(), state = randomToken();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  store.set(pendingKey, JSON.stringify({ verifier, state, challenge }));
}
async function authRequest(path: string, body: unknown, token?: string): Promise<any> {
  // Exact's host deadline stays integral on the native live clock. The pinned
  // runtime can turn AbortSignal.timeout's remaining time into a fraction.
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), exactTimeout: 15000 });
  const result = await response.json();
  if (!response.ok) throw refused(result.denied ?? { code: 'E_AUTH', message: 'Sign-in could not complete. Try again.' });
  return result;
}

function reject(code: string, message: string): never { throw refused({ code, message }); }
async function using<T>(store: Store, storage: Storage, native: NativeModule | null | undefined, now: number, browser: boolean, fn: (db: Snapback) => Promise<T>): Promise<T> {
  // A web presentation hatch supplies a module too; it is not the native
  // Snapback device. Navigation Timing is present only in a browser.
  const db = await Snapback.open({ app: appId, name: sessionKey, origin, storage, native, device: browser ? 'web' : 'native', auth: { store, key: sessionKey, now } });
  try { return await fn(db); } finally { await db.close(); }
}
function isActor(store: Store, principal: string) {
  try { return Boolean(principal) && JSON.parse(store.get(sessionKey)||'{}').principal === principal; } catch {return false;}
}
function actor(store: Store, principal: string) {
  if (!isActor(store,principal)) reject('E_STALE', 'Sign in again before using this account.');
}
function draftsFor(store: Store, storage: Storage, principal: string) {
  actor(store, principal); return new Drafts(storage.fs, origin, principal);
}
async function experienceFor(store: Store, storage: Storage, principal: string) {
  const drafts=draftsFor(store,storage,principal);
  const initial=await drafts.mode();
  return accountExperience(principal,initial);
}
function transport(db: Snapback, store: Store, principal: string): Request {
  actor(store, principal);
  const raw=store.get(sessionKey), token=db.session?.token;
  if (!token || db.session?.principal !== principal) reject('E_AUTH','Sign in before reading or posting.');
  const check=()=>{if(store.get(sessionKey)!==raw)reject('E_STALE','The account changed while the request was in flight.');};
  return async (kind,operation,args,id) => {
    check();
    const response=await fetch(`${origin}/${kind}/${encodeURIComponent(operation)}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(kind==='m'?{id:id||newIntent(),args}:{args}),exactTimeout:15000});
    const result=await response.json(); check();
    if(!response.ok || result.denied) throw refused(result.denied || {code:'E_NETWORK',message:'Could not reach Jera. Your draft is kept.'});
    return result;
  };
}
const profileCache=new Map<string,{at:number; profile:Awaited<ReturnType<typeof loadAccountProfile>>}>();
async function postProfile(principal:string,storage:Storage,now:number){
  const cached=profileCache.get(principal);
  if(cached && now-cached.at<300000)return cached.profile;
  const profile=await loadAccountProfile(principal,storage);
  if(profileCache.size>256)profileCache.clear();
  profileCache.set(principal,{at:now,profile});return profile;
}
function draftEnvelope(principal:string,scope:string,draft:Awaited<ReturnType<Drafts['get']>>){return{principal,scope,body:draft.body,revision:draft.revision,pendingMode:draft.sealed?.visibility||'',format:draft.composition?.lexicon.ref||'text',audienceId:draft.composition?.audience||'',fields:draft.composition?formFields(draft.composition):[]};}
async function editedDraft(local:Drafts,scope:string,audience:string,body:string,fields:Field[]){
  const saved=await local.get(scope);
  return saved.composition?editedComposition(saved.composition,saved.composition.audience,body,fields):undefined;
}
const sources: Sources = {
  viewOptions: async () => viewChoices,
  viewPolicy: async ([id]) => {
    try {const view=selectedView(id);const policy=writingPolicy(view);return {id, mode:policy?.mode || '', writable:Boolean(policy), available:true};}
    catch {return {id,mode:'',writable:false,available:false};}
  },
  refreshPostProfiles: async ([principal,viewId,authors,now],store,storage) => {
    const empty={principal:'',viewId,profiles:[]};
    if(!isActor(store,principal))return empty;
    // The account's existing profile resource owns its refresh. Every other
    // lookup stays inside this explicit answer's lifetime, never a detached job.
    const ids=[...new Set(authors)].filter(did=>did!==principal && /^did:(plc|web):/.test(did)).slice(0,24);
    const profiles=await Promise.all(ids.map(did=>postProfile(did,storage,now)));
    return isActor(store,principal)?{principal,viewId,profiles}:empty;
  },
  loadWritingContext: async ([principal,active,audienceId,parent,now,browser],store,storage,native) => {
    const unavailable={principal,audienceId,audienceLabel:'',available:false};
    if(!active||!audienceId||!isActor(store,principal))return unavailable;
    return using(store,storage,native,now,browser,async db=>{
      const request=transport(db,store,principal);
      const all=await allRows(request,'availableAudiences');
      const parentResult=parent?await request('q','postById',{id:parent}):null;
      if(parentResult && (!parentResult.complete || !parentResult.data || parentResult.data.deleted))return unavailable;
      const parentPost=parentResult?.data;
      const audience=all.find(a=>a.id===audienceId && (parentPost?.visibility==='private'?a.id===parentPost.audience:a.owner===principal));
      if(!audience)return unavailable;
      return {principal,audienceId,audienceLabel:audience.kind==='owner'?(audience.name==='Only me'?'Only me':`${audience.name} · only you`):`${audience.name} · shared`,available:true};
    });
  },
  experienceSnapshot: async ([principal],store,storage) => {
    if(!isActor(store,principal))return {principal:'',mode:'private',revision:0};
    try {const state=(await experienceFor(store,storage,principal)).getSnapshot();return isActor(store,principal)?{principal,...state}:{principal:'',mode:'private',revision:0};}
    catch {return {principal:'',mode:'private',revision:0};}
  },
  changeExperience: async ([principal,mode,now],store,storage) => {
    if(mode!=='public' && mode!=='private')reject('E_INPUT','Unknown experience.');
    const context=await experienceFor(store,storage,principal);
    await draftsFor(store,storage,principal).setMode(mode);
    actor(store,principal); return {principal,...context.change(mode,now)};
  },
  prepareDraft: async ([principal,mode,parent,context,now,browser],store,storage,native) => {
    const local=draftsFor(store,storage,principal);
    // No transport is opened for an ordinary unposted draft. An unavailable
    // publication lookup preserves the sealed draft, including while offline.
    const view=selectedView(mode);
    await adoptLegacyPublicReply(local,parent);
    let draft=await beginDraft((kind,operation,args,id)=>using(store,storage,native,now,browser,db=>transport(db,store,principal)(kind,operation,args,id)),local,mode as Mode,parent,view.id);
    if(mode==='private' && !draft.viewContext)draft=await preparePrivateWriting(local,draftScope(view.id,parent))||draft;
    draft=await prepareViewDraft(local,view,parent)||draft;
    actor(store,principal);
    return {...draftEnvelope(principal,draftScope(mode,parent),draft),context};
  },
  syncDraft: async ([principal,mode,parent,context,now,browser],store,storage,native) => {
    const scope=draftScope(mode,parent);
    if(!isActor(store,principal))return {principal:'',scope,body:'',revision:0,priorRevision:0,state:'pending',context,format:'text',audienceId:'',fields:[]};
    const local=draftsFor(store,storage,principal);
    try {
      const synced=await using(store,storage,native,now,browser,async db=>{
        const request=transport(db,store,principal);
        await adoptLegacyPublicReply(local,parent,mode==='public'?request:undefined);
        return syncScope(request,local,scope);
      });
      if(mode==='private' && !synced.draft.viewContext)synced.draft=await preparePrivateWriting(local,scope)||synced.draft;
      synced.draft=await prepareViewDraft(local,selectedView(mode),parent)||synced.draft;
      const {pendingMode,...saved}=draftEnvelope(principal,scope,synced.draft);return {...saved,priorRevision:synced.priorRevision,state:'sent',context};
    } catch {
      const draft=await local.get(scope);
      assertDraftContext(selectedView(mode),draft);
      const {pendingMode,...saved}=draftEnvelope(isActor(store,principal)?principal:'',scope,draft);return {...saved,priorRevision:draft.revision,state:'pending',context};
    }
  },
  syncAllDrafts: async ([principal,now,browser],store,storage,native) => {
    if(!isActor(store,principal))return {state:'pending',id:''};
    try {
      await using(store,storage,native,now,browser,db=>syncDrafts(transport(db,store,principal),draftsFor(store,storage,principal)));
      return {state:'sent',id:''};
    } catch {return {state:'pending',id:''};}
  },
  saveDraft: async ([principal,mode,parent,body,revision,audience,fields],store,storage) => {
    const scope=draftScope(mode,parent);
    const local=draftsFor(store,storage,principal);assertDraftContext(selectedView(mode),await local.get(scope));const draft=await local.save(scope,body,revision,await editedDraft(local,scope,audience,body,fields)); actor(store,principal);
    return draftEnvelope(principal,scope,draft);
  },
  loadPosts: async ([principal,viewId,browser,now],store,storage,native) => {
    if(!isActor(store,principal))return {principal:'',viewId,authorIds:[],posts:[],available:false};
    try {return await using(store,storage,native,now,browser,async db=>{
      const request=transport(db,store,principal);
      const authorized=await allRows(request,'postsList') as PostRecord[];
      const selection=selectPosts(selectedView(viewId),authorized), newest=selection.records;
      const audiences=await allRows(request,'availableAudiences');
      const audienceNames=new Map(audiences.map(a=>[a.id,a.kind==='owner'?'Only me':a.name==='Private'?'Personal · shared':a.name+' · shared']));
      const records=[...newest].sort((a,b)=>a.at-b.at || a.id.localeCompare(b.id));
      const ids=[...new Set(newest.slice(0,100).map(p=>p.author))].slice(0,24);
      // Fresh records do not wait for optional public profile networking.
      const profiles=new Map(await Promise.all(ids.map(async did=>[did,await readCachedAccountProfile(did,storage)] as const)));
      actor(store,principal);
      const byId=new Map(records.map(p=>[p.id,p]));
      const publicCounts=new Map<string,number>(),readableCounts=new Map<string,number>();
      for(const p of records)if(p.parent&&!p.deleted){readableCounts.set(p.parent,(readableCounts.get(p.parent)||0)+1);if(p.visibility==='public')publicCounts.set(p.parent,(publicCounts.get(p.parent)||0)+1);}
      const displayName=(did:string)=>{const profile=profiles.get(did);return profile?.handle?profile.name:did===principal?'You':'…'+did.slice(-6);};
      const posts=records.map(p=>{
        const profile=profiles.get(p.author);
        const name=displayName(p.author);
        const parentAuthor=p.parent?displayName(byId.get(p.parent)?.author||''):'';
        const elapsed=Math.max(0,now-p.at),minutes=Math.floor(elapsed/60000);
        const stamp=minutes<1?'now':minutes<60?`${minutes}m`:minutes<1440?`${Math.floor(minutes/60)}h`:`${Math.floor(minutes/1440)}d`;
        let detail={purpose:'',references:[] as {id:string;uri:string;revision:string}[]};
        if(!p.deleted&&p.lexicon==='contribution.v1'&&p.payloadJson){const value=JSON.parse(p.payloadJson);detail={purpose:value.purpose,references:value.references.map((r:any,i:number)=>({id:`${p.id}-${i}`,uri:r.uri,revision:r.revision||''}))};}
        return {...detail,feed:selection.feed.has(p.id),audienceLabel:audienceNames.get(p.audience)||'Personal',id:p.id,network:false,missingParent:false,images:[],embedUrl:'',embedLabel:'',sourceUrl:'',canDelete:p.author===principal&&!p.deleted,deleted:!!p.deleted,parentAuthor,parentPrincipal:p.parent?byId.get(p.parent)?.author||'':'',parentPublic:p.parent?byId.get(p.parent)?.visibility==='public':false,publicReplies:publicCounts.get(p.id)||0,readableReplies:readableCounts.get(p.id)||0,root:p.root||'',parent:p.parent||'',principal:p.author,avatar:profile?.avatar||'',audience:p.audience||'',at:p.at,visibility:p.visibility,author:name,handle:profile?.handle||'',initial:name.slice(0,1).toUpperCase(),body:p.deleted?"This post was deleted.":p.body,stamp};
      });
      return {principal,viewId,authorIds:ids,posts,available:true};
    });} catch {return {principal:isActor(store,principal)?principal:'',viewId,authorIds:[],posts:[],available:false};}
  },
  loadEarlierDrafts: async ([principal,active,now,browser],store,storage,native) => {
    if(!active||!isActor(store,principal))return {principal:'',items:[],available:false};
    const drafts=draftsFor(store,storage,principal);
    let result;
    try {result=await using(store,storage,native,now,browser,db=>earlierPublicDrafts(transport(db,store,principal),drafts));}
    catch {result=await earlierPublicDrafts(async()=>{throw new Error('Offline');},drafts);}
    actor(store,principal);return {principal,...result};
  },
  copyEarlierDraft: async ([principal,id,body,revision,now,browser],store,storage,native) => {
    const experience=await experienceFor(store,storage,principal), drafts=draftsFor(store,storage,principal);
    try {
      await using(store,storage,native,now,browser,db=>copyEarlierPublicDraft(transport(db,store,principal),drafts,{id,body,revision}));
    } catch(error) {reject('E_DRAFT',(error as Error).message||'Could not copy this draft. The original is kept.');}
    actor(store,principal);await drafts.setMode('private');actor(store,principal);
    return {principal,...experience.change('private',now)};
  },
  publishPost: async ([principal,mode,parent,body,revision,audience,fields,now,browser],store,storage,native) => using(store,storage,native,now,browser,async db=>{
    try {
      if(parent.startsWith('at://'))throw new Error('Bluesky replies are not available in this view. Your draft is kept.');
      const local=draftsFor(store,storage,principal), view=selectedView(mode);
      const saved=await local.get(draftScope(view.id,parent));
      const policy=saved.sealed?null:writingPolicy(view);
      assertDraftContext(view,saved);
      if(!policy && !saved.sealed)throw new Error('This view is read-only.');
      const composition=await editedDraft(local,draftScope(mode as Mode,parent),audience,body,fields);
      const result=await publish(transport(db,store,principal),local,policy?.mode || saved.sealed!.visibility,parent,revision,body,composition,async envelope=>{
        actor(store,principal);const raw=store.get(sessionKey);
        try {const result=await authRequest('/records/publish',envelope,db.session?.token);if(store.get(sessionKey)!==raw)reject('E_STALE','The account changed.');return result;}
        catch(e){const code=(e as any).code||'';if(['INVALID_PAYLOAD','UNKNOWN_LEXICON','LEXICON_CHANGED','AUDIENCE_UNAVAILABLE','DIFFERENT_AUDIENCE','PARENT_UNAVAILABLE','PARENT_DELETED','CANNOT_WIDEN_AUDIENCE','REPLY_NOT_ALLOWED','INTENT_REUSE','E_INPUT'].includes(code))return {state:'failed',why:{message:(e as Error).message}};throw e;}
      },policy?.definition,view.id);
      actor(store,principal); return {...result,principal,message:''};
    } catch(error) {
      actor(store,principal);
      return {state:'failed',id:'',parent,principal,visibility:mode,message:(error as Error).message || 'Could not post. Your draft is kept.'};
    }
  }),
  deletePost: async ([principal,id,now,browser],store,storage,native) => using(store,storage,native,now,browser,async db=>{
    const response=await transport(db,store,principal)('m','deletePost',{id},newIntent());
    if(response.state==='failed')throw refused(response.why);
    if(response.state!=='sent'||response.result?.id!==id||response.result?.deleted!==true)reject('E_NETWORK','Could not confirm deletion. Try again.');
    actor(store,principal);return {state:'sent',id};
  }),
  loadAudience: async ([principal,browser,now],store,storage,native) => {
    if(!isActor(store,principal))return {principal:'',id:'',members:[],available:false};
    try {return await using(store,storage,native,now,browser,async db=>{
      const request=transport(db,store,principal);const groups=await allRows(request,'audienceList');
      const id=groups[0]?.id||'';
      const members=id?await allRows(request,'audienceMembersList',{audience:id}):[];
      return {principal,id,members:members.map(m=>({principal:m.principal,access:m.access})),available:true};
    });} catch {return {principal:isActor(store,principal)?principal:'',id:'',members:[],available:false};}
  },
  grantAudience: async ([principal,did,now,browser],store,storage,native) => using(store,storage,native,now,browser,async db=>{
    const value=parseLoginInput(did.trim());
    if(!value.valid || !value.value.startsWith('did:'))reject('E_INPUT','Enter a complete DID.');
    const request=transport(db,store,principal);const group=await request('m','ensureAudience',{},newIntent());
    if(group.state!=='sent'||!group.result?.id)reject('E_NETWORK','Could not open your private audience.');
    const result=await request('m','setAudienceMember',{audience:group.result.id,principal:value.value,access:'reply'},newIntent());
    if(result.state==='failed')throw refused(result.why);
    return {state:'sent',id:value.value};
  }),
  revokeAudience: async ([principal,audience,did,now,browser],store,storage,native) => using(store,storage,native,now,browser,async db=>{
    const result=await transport(db,store,principal)('m','removeAudienceMember',{audience,principal:did},newIntent());
    if(result.state==='failed')throw refused(result.why);
    return {state:'sent',id:did};
  }),
  accountProfile: ([principal], store, storage) => loadAccountProfile(principal, storage),
  logout: ([now, browser], store, storage, native) => using(store, storage, native, now, browser, async db => {
    await db.logout(); return { state: 'sent', id: '' };
  }),
  loginInput: ([input]) => parseLoginInput(input),
  lookupAccounts: async ([query]) => {
    if (query.trim().replace(/^@/, '').length < 2 || query.trim().startsWith('did:')) return { query, items: [], available: true, complete: true };
    try {
      const result = await authRequest('/oauth/accounts', { query });
      return { ...result, items: result.items.map((actor: { avatar?: string }) => ({ ...actor, avatar: actor.avatar ?? '' })) };
    } catch {
      return { query, items: [], available: false, complete: false };
    }
  },
  restore: async ([browser, now], store, storage, native) => {
    // Prepare before the press so web hosts can open their popup synchronously.
    await prepareLogin(store);
    return using(store, storage, native, now, browser, async db => {
      if (!db.session) return { principal: '' };
      const raw = store.get(sessionKey);
      try {
        const { did } = await authRequest('/oauth/check', {}, db.session.token);
        if (store.get(sessionKey) !== raw) reject('E_STALE', 'The account changed while checking authorization.');
        if (did !== db.session.principal) reject('E_AUTH', 'The account changed. Sign in again.');
      } catch (error) {
        if (store.get(sessionKey) !== raw) throw error;
        if ((error as { code?: string }).code === 'E_AUTH') { await db.logout(); return { principal: '' }; }
        // Offline restoration preserves this account's partition and draft.
        // Online operations still require a valid backend session.
      }
      return { principal: db.session?.principal ?? '' };
    });
  },
  login: async ([handle, now], store, storage, native) => {
    const input = parseLoginInput(handle);
    if (!input.valid) reject('E_INPUT', 'Enter your full ATproto handle or DID.');
    if (store.get(sessionKey)) reject('E_AUTH', 'Sign out before changing accounts.');
    const pending = store.get(pendingKey);
    if (!pending) reject('E_AUTH', 'Refresh before signing in.');
    const flow = { ...JSON.parse(pending), callback: authCallback() };
    const url = `${origin}/oauth/start?handle=${encodeURIComponent(input.value)}&state=${flow.state}&challenge=${flow.challenge}&callback=${encodeURIComponent(flow.callback)}`;
    try {
      const back = new URL(await openAuthSession(url, { callback: flow.callback, state: flow.state }));
      if (back.searchParams.get('state') !== flow.state || !back.searchParams.get('code')) reject('E_AUTH', 'Sign-in could not be verified.');
      const result = await authRequest('/oauth/exchange', { state: flow.state, code: back.searchParams.get('code'), verifier: flow.verifier });
      if (store.get(pendingKey) !== pending || store.get(sessionKey)) reject('E_AUTH', 'The sign-in attempt changed. Try again.');
      const session = result.session;
      if (!session || !/^did:(plc|web):/.test(session.principal) || typeof session.token !== 'string' || !session.token || !Number.isFinite(session.expiresAt) || session.expiresAt <= now) reject('E_AUTH', 'The server returned an invalid account session.');
      store.set(sessionKey, JSON.stringify(session));
      return { state: 'sent', id: session.principal };
    } finally {
      if (store.get(pendingKey) === pending) await prepareLogin(store, true);
    }
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
