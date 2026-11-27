import type { Answer, Sources, Store, Storage } from './app.contract.d.ts';
import { accessSession, forgetAccess, refused, type Access } from './access-session.ts';
import { rememberedSession, validAccess } from './remembered-session.ts';
import { parseLoginInput } from './login-input.ts';
import { loadAccountProfile, readCachedAccountProfile } from './account-profile.ts';
import { resolveAudienceIdentity } from './audience-identity.ts';
import { Drafts, beginDraft, allRows, draftScope, publish, newIntent, syncScope, syncDrafts, type Mode, type Request } from './social-data.ts';
import { formFields, editedComposition, type Field } from './composition.ts';
import { measureBlueskyPost, openBluesky, saveBluesky, sendBluesky } from './bluesky.ts';
import { accountExperience, getExperienceSnapshot } from './experience-store.ts';
import { preparePrivateWriting } from './private-writing.ts';
import { selectedView, writingPolicy, viewChoices, prepareViewDraft, assertDraftContext, adoptLegacyPublicReply } from './view-context.ts';
import { readTimeline } from './feed-page.ts';
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
  if (value === 'http://127.0.0.1:4497') return 'jera-http-127.0.0.1-4497';
  if (value === 'http://127.0.0.1:4477') return 'jera-http-127.0.0.1-4477';
  throw new Error('Unconfigured Jera backend: add an origin-specific storage key and grant before using it.');
}
const sessionKey = storageKey(origin) + '-atproto-v1';
const pendingKey = sessionKey + '-login';
export const grants = `net.fetch ${origin}\nnet.fetch https://public.api.bsky.app\nnet.fetch https://slingshot.microcosm.blue\nnet.fetch https://cdn.bsky.app\nauth.session ${origin}\nauth.callback studio.zojer.jera.exact:/oauth\nauth.callback https://jera.ink/.exact/auth/callback\nsqlite.open app:/data\nsecret.keep jera-http-127.0.0.1-4417-atproto-v1\nsecret.keep jera-http-127.0.0.1-4437-atproto-v1\nsecret.keep jera-http-127.0.0.1-4457-atproto-v1\nsecret.keep jera-http-127.0.0.1-4497-atproto-v1\nsecret.keep jera-http-127.0.0.1-4477-atproto-v1\nsecret.keep jera-https-snapback-jera-ink-atproto-v1\nsecret.keep jera-http-127.0.0.1-4417-atproto-v1-login\nsecret.keep jera-http-127.0.0.1-4417-atproto-v1-device\nsecret.keep jera-http-127.0.0.1-4437-atproto-v1-login\nsecret.keep jera-http-127.0.0.1-4437-atproto-v1-device\nsecret.keep jera-http-127.0.0.1-4457-atproto-v1-login\nsecret.keep jera-http-127.0.0.1-4457-atproto-v1-device\nsecret.keep jera-http-127.0.0.1-4497-atproto-v1-login\nsecret.keep jera-http-127.0.0.1-4497-atproto-v1-device\nsecret.keep jera-http-127.0.0.1-4477-atproto-v1-login\nsecret.keep jera-http-127.0.0.1-4477-atproto-v1-device\nsecret.keep jera-https-snapback-jera-ink-atproto-v1-login\nsecret.keep jera-https-snapback-jera-ink-atproto-v1-device\nfs.read app:/data\nfs.write app:/data`;

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
  if (!response.ok) {
    const denied = result?.denied;
    const code = denied?.code === 'E_AUTH' && response.status !== 401 ? 'E_SIGN_IN' : denied?.code ?? 'E_SIGN_IN';
    throw refused({ code, message: denied?.message ?? 'Sign-in could not complete. Try again.' });
  }
  return result;
}

function reject(code: string, message: string): never { throw refused({ code, message }); }
async function using<T>(store: Store, now: number, browser: boolean, fn: (session: Access | null) => Promise<T>): Promise<T> {
  const remembered = rememberedSession(store, sessionKey, authRequest);
  if (remembered.present() && !await remembered.restore(now, browser, false)) reject('E_AUTH', 'Sign in again.');
  return fn(await accessSession(store, sessionKey, now, authRequest));
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
  const initial=getExperienceSnapshot(principal)?.mode ?? await drafts.mode();
  return accountExperience(principal,initial);
}
function transport(session: Access | null, store: Store, principal: string): Request {
  actor(store, principal);
  const raw=store.get(sessionKey), token=session?.token;
  if (!token || session?.principal !== principal) reject('E_AUTH','Sign in before reading or posting.');
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
async function authorize(store: Store, handle: string, posting = false) {
  const pending = store.get(pendingKey);
  if (!pending) reject('E_AUTH', 'Refresh before authorizing.');
  const account = store.get(sessionKey);
  const token = posting ? JSON.parse(account || '{}').token : undefined;
  if (posting) actor(store, handle);
  const flow = { ...JSON.parse(pending), callback: authCallback() };
  const url = `${origin}/oauth/start?handle=${encodeURIComponent(handle)}&state=${flow.state}&challenge=${flow.challenge}&callback=${encodeURIComponent(flow.callback)}${posting ? '&purpose=bluesky' : ''}`;
  try {
    const back = new URL(await openAuthSession(url, { callback: flow.callback, state: flow.state }));
    if (back.searchParams.get('state') !== flow.state || !back.searchParams.get('code')) reject('E_AUTH', 'Authorization could not be verified.');
    const result = await authRequest('/oauth/exchange', { state: flow.state, code: back.searchParams.get('code'), verifier: flow.verifier, rememberDevice: !posting }, token);
    if (store.get(pendingKey) !== pending || store.get(sessionKey) !== account) reject('E_STALE', 'The account changed during authorization.');
    return result;
  } finally {
    if (store.get(pendingKey) === pending) await prepareLogin(store, true);
  }
}

const sources: Sources = {
  threadView: async ([did, id, browser, now], store, storage, native) => {
    if (!id || !isActor(store, did)) return { state: '', id: '' };
    return using(store, now, browser, async db => {
      const post = (await transport(db, store, did)('q', 'postById', { id })).data;
      return post?.id === id ? { id, state: post.visibility === 'public' ? 'public' : 'private' } : { state: '', id: '' };
    });
  },
  skyPostSize: ([text]) => measureBlueskyPost(text),
  openSkyDraft: async ([did], store, storage) => ({ principal: did, ...await openBluesky(draftsFor(store, storage, did)) }),
  saveSkyDraft: async ([did, intent, revision, text], store, storage) => {
    await saveBluesky(draftsFor(store, storage, did), intent, revision, text);
    return { state: 'saved', id: intent };
  },
  skyPermission: async ([did], store) => {
    const offline = { principal: did, available: false, enabled: false };
    if (!isActor(store, did)) return offline;
    try {
      const result = await authRequest('/oauth/posting-status', { did }, JSON.parse(store.get(sessionKey)!).token);
      if (!isActor(store, did) || result.did !== did) return offline;
      return { principal: did, available: true, enabled: result.enabled === true };
    } catch { return offline; }
  },
  enableSky: async ([did], store) => {
    const result = await authorize(store, did, true);
    if (result.did !== did || result.enabled !== true) reject('E_PERMISSION', 'Posting permission was not granted.');
    return { state: 'enabled', id: did };
  },
  publishSky: async ([did, intent, revision, text], store, storage) => {
    const drafts = draftsFor(store, storage, did);
    try {
      const saved = await sendBluesky(drafts, intent, revision, text, payload => {
        actor(store, did);
        return authRequest('/records/bluesky', payload, JSON.parse(store.get(sessionKey)!).token);
      });
      return { principal: did, ...saved, message: '' };
    } catch (error) {
      return { principal: did, ...await openBluesky(drafts), message: (error as Error).message || 'Could not confirm publication.' };
    }
  },
  viewOptions: async () => viewChoices,
  viewPolicy: async ([id]) => {
    if (id === 'bluesky') return { id, mode: id, writable: false, available: true }; // Dedicated PDS composer.
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
    return using(store,now,browser,async db=>{
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
    if(mode!=='public' && mode!=='private' && mode!=='bluesky')reject('E_INPUT','Unknown experience.');
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
    let draft=await beginDraft((kind,operation,args,id)=>using(store,now,browser,db=>transport(db,store,principal)(kind,operation,args,id)),local,mode as Mode,parent,view.id);
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
      const synced=await using(store,now,browser,async db=>{
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
      await using(store,now,browser,db=>syncDrafts(transport(db,store,principal),draftsFor(store,storage,principal)));
      return {state:'sent',id:''};
    } catch {return {state:'pending',id:''};}
  },
  saveDraft: async ([principal,mode,parent,body,revision,audience,fields],store,storage) => {
    const scope=draftScope(mode,parent);
    const local=draftsFor(store,storage,principal);assertDraftContext(selectedView(mode),await local.get(scope));const draft=await local.save(scope,body,revision,await editedDraft(local,scope,audience,body,fields)); actor(store,principal);
    return draftEnvelope(principal,scope,draft);
  },
  loadPosts: async ([principal,viewId,cursor,focus,visit,browser,now],store,storage,native) => {
    if(viewId==='bluesky' || !isActor(store,principal))return {principal:'',viewId,cursor,focus,visit,next:'',partial:false,authorIds:[],posts:[],available:false};
    try {return await using(store,now,browser,async db=>{
      const request=transport(db,store,principal);
      const {rows,next,partial}=await readTimeline(request,selectedView(viewId),cursor,focus);
      const records=rows.sort((a,b)=>a.post.at-b.post.at || a.post.id.localeCompare(b.post.id));
      const ids=[...new Set(records.slice(-100).reverse().flatMap(row=>row.parent ? [row.post.author,row.parent.author] : [row.post.author]))].slice(0,24);
      // Fresh records do not wait for optional public profile networking.
      const profiles=new Map(await Promise.all(ids.map(async did=>[did,await readCachedAccountProfile(did,storage)] as const)));
      actor(store,principal);
      const displayName=(did:string)=>{const profile=profiles.get(did);return profile?.handle?profile.name:did===principal?'You':'…'+did.slice(-6);};
      const posts=records.map(({post:p,feed,parent,audience,publicReplies,readableReplies})=>{
        const profile=profiles.get(p.author);
        const name=displayName(p.author);
        const parentAuthor=parent ? displayName(parent.author) : '';
        const audienceLabel=audience ? (audience.kind==='owner' ? 'Only me' : (audience.name==='Private' ? 'Personal' : audience.name)+' · shared') : 'Personal';
        const elapsed=Math.max(0,now-p.at),minutes=Math.floor(elapsed/60000);
        const stamp=minutes<1?'now':minutes<60?`${minutes}m`:minutes<1440?`${Math.floor(minutes/60)}h`:`${Math.floor(minutes/1440)}d`;
        let detail={purpose:'',references:[] as {id:string;uri:string;revision:string}[]};
        if(!p.deleted&&p.lexicon==='contribution.v1'&&p.payloadJson){const value=JSON.parse(p.payloadJson);detail={purpose:value.purpose,references:value.references.map((r:any,i:number)=>({id:`${p.id}-${i}`,uri:r.uri,revision:r.revision||''}))};}
        return {...detail,feed,audienceLabel,id:p.id,network:false,missingParent:false,images:[],embedUrl:'',embedLabel:'',sourceUrl:'',canDelete:p.author===principal&&!p.deleted,deleted:!!p.deleted,parentAuthor,parentPrincipal:parent?.author||'',parentPublic:parent?.visibility==='public',publicReplies,readableReplies,root:p.root||'',parent:p.parent||'',principal:p.author,avatar:profile?.avatar||'',audience:p.audience||'',at:p.at,visibility:p.visibility,author:name,usesHandle:profile?.usesHandle ?? false,handle:profile?.handle||'',initial:name.slice(0,1).toUpperCase(),body:p.deleted?"This post was deleted.":p.body,stamp};
      });
      return {principal,viewId,cursor,focus,visit,next,partial,authorIds:ids,posts,available:true};
    });} catch {return {principal:isActor(store,principal)?principal:'',viewId,cursor,focus,visit,next:'',partial:false,authorIds:[],posts:[],available:false};}
  },
  loadEarlierDrafts: async ([principal,active,now,browser],store,storage,native) => {
    if(!active||!isActor(store,principal))return {principal:'',items:[],available:false};
    const drafts=draftsFor(store,storage,principal);
    let result;
    try {result=await using(store,now,browser,db=>earlierPublicDrafts(transport(db,store,principal),drafts));}
    catch {result=await earlierPublicDrafts(async()=>{throw new Error('Offline');},drafts);}
    actor(store,principal);return {principal,...result};
  },
  copyEarlierDraft: async ([principal,id,body,revision,now,browser],store,storage,native) => {
    const experience=await experienceFor(store,storage,principal), drafts=draftsFor(store,storage,principal);
    try {
      await using(store,now,browser,db=>copyEarlierPublicDraft(transport(db,store,principal),drafts,{id,body,revision}));
    } catch(error) {reject('E_DRAFT',(error as Error).message||'Could not copy this draft. The original is kept.');}
    actor(store,principal);await drafts.setMode('private');actor(store,principal);
    return {principal,...experience.change('private',now)};
  },
  publishPost: async ([principal,mode,parent,body,revision,audience,fields,now,browser],store,storage,native) => using(store,now,browser,async db=>{
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
        try {const result=await authRequest('/records/publish',envelope,db?.token);if(store.get(sessionKey)!==raw)reject('E_STALE','The account changed.');return result;}
        catch(e){const code=(e as any).code||'';if(['INVALID_PAYLOAD','UNKNOWN_LEXICON','LEXICON_CHANGED','AUDIENCE_UNAVAILABLE','DIFFERENT_AUDIENCE','PARENT_UNAVAILABLE','PARENT_DELETED','CANNOT_WIDEN_AUDIENCE','REPLY_NOT_ALLOWED','INTENT_REUSE','E_INPUT'].includes(code))return {state:'failed',why:{message:(e as Error).message}};throw e;}
      },policy?.definition,view.id);
      actor(store,principal); return {...result,principal,message:''};
    } catch(error) {
      actor(store,principal);
      return {state:'failed',id:'',parent,principal,visibility:mode,message:(error as Error).message || 'Could not post. Your draft is kept.'};
    }
  }),
  deletePost: async ([principal,id,now,browser],store,storage,native) => using(store,now,browser,async db=>{
    const response=await transport(db,store,principal)('m','deletePost',{id},newIntent());
    if(response.state==='failed')throw refused(response.why);
    if(response.state!=='sent'||response.result?.id!==id||response.result?.deleted!==true)reject('E_NETWORK','Could not confirm deletion. Try again.');
    actor(store,principal);return {state:'sent',id};
  }),
  loadAudience: async ([principal,browser,now],store,storage,native) => {
    if(!isActor(store,principal))return {principal:'',id:'',members:[],available:false};
    try {return await using(store,now,browser,async db=>{
      const request=transport(db,store,principal);const groups=await allRows(request,'audienceList');
      const id=groups[0]?.id||'';
      const members=id?await allRows(request,'audienceMembersList',{audience:id}):[];
      return {principal,id,members:members.map(m=>({principal:m.principal,access:m.access,name:'',handle:'',avatar:''})),available:true};
    });} catch {return {principal:isActor(store,principal)?principal:'',id:'',members:[],available:false};}
  },
  loadAudienceProfiles: async ([principal,members,now],store,storage) => {
    const profiles: Awaited<ReturnType<typeof loadAccountProfile>>[] = [];
    if(!isActor(store,principal))return {principal:'',profiles};
    const queue=[...new Set(members)].filter(did=>parseLoginInput(did).valid && did.startsWith('did:') && did!==principal);
    await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{
      while(queue.length && isActor(store,principal)){
        const did=queue.shift()!;
        const profile=await postProfile(did,storage,now);
        if(profile.handle){profiles.push(profile);continue;}
        try{
          const {handle}=await resolveAudienceIdentity(did);
          profiles.push({...profile,handle,name:handle,usesHandle:true});
        }catch{ /* The membership row stays available with its DID. */ }
      }
    }));
    return isActor(store,principal)?{principal,profiles}:{principal:'',profiles:[]};
  },
  grantAudience: async ([principal,input,now,browser],store,storage,native) => using(store,now,browser,async db=>{
    const value=parseLoginInput(input);
    if(!value.valid)reject('E_INPUT','Enter a full @handle or DID.');
    const request=transport(db,store,principal);
    const did=value.value.startsWith('did:')?value.value:await resolveAudienceIdentity(value.value)
      .then(identity=>identity.did,()=>reject('E_INPUT','Could not verify this handle. Check the spelling or enter a DID.'));
    if(did===principal)reject('E_INPUT','You already own this audience.');
    const group=await request('m','ensureAudience',{},newIntent());
    if(group.state!=='sent'||!group.result?.id)reject('E_NETWORK','Could not open your private audience.');
    const result=await request('m','setAudienceMember',{audience:group.result.id,principal:did,access:'reply'},newIntent());
    if(result.state==='failed')throw refused(result.why);
    if(result.state!=='sent'||result.result?.principal!==did||result.result?.access!=='reply')reject('E_NETWORK','Could not confirm the account was added. Try again.');
    return {state:'sent',id:did};
  }),
  revokeAudience: async ([principal,audience,did,now,browser],store,storage,native) => using(store,now,browser,async db=>{
    const result=await transport(db,store,principal)('m','removeAudienceMember',{audience,principal:did},newIntent());
    if(result.state==='failed')throw refused(result.why);
    return {state:'sent',id:did};
  }),
  accountProfile: ([principal], store, storage) => loadAccountProfile(principal, storage),
  logout: async ([now, browser], store, storage, native) => {
    const retireAccess = () => forgetAccess(store, sessionKey, authRequest);
    if (!await rememberedSession(store, sessionKey, authRequest).logout(retireAccess)) await retireAccess();
    return { state: 'sent', id: '' };
  },
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
    const remembered = await rememberedSession(store, sessionKey, authRequest).restore(now, browser, true);
    if (remembered !== null) return { principal: remembered };
    return using(store, now, browser, async db => {
      if (!db) return { principal: '' };
      const raw = store.get(sessionKey);
      try {
        const { did } = await authRequest('/oauth/check', {}, db.token);
        if (store.get(sessionKey) !== raw) reject('E_STALE', 'The account changed while checking authorization.');
        if (typeof did !== 'string' || !/^did:(plc|web):/.test(did)) throw new Error('Could not verify account status.');
        if (did !== db.principal) reject('E_AUTH', 'The account changed. Sign in again.');
      } catch (error) {
        if (store.get(sessionKey) !== raw) throw error;
        if ((error as { code?: string }).code === 'E_AUTH') { await forgetAccess(store, sessionKey, authRequest); return { principal: '' }; }
        // Offline restoration preserves this account's partition and draft.
        // Online operations still require a valid backend session.
      }
      return { principal: db.principal };
    });
  },
  login: async ([handle, now], store, storage, native) => {
    const input = parseLoginInput(handle);
    if (!input.valid) reject('E_INPUT', 'Enter your full ATproto handle or DID.');
    if (store.get(sessionKey) || rememberedSession(store, sessionKey, authRequest).present()) reject('E_AUTH', 'Sign out before changing accounts.');
    const result = await authorize(store, input.value);
    if (!validAccess(result.session, now)) reject('E_AUTH', 'The server returned an invalid account session.');
    rememberedSession(store, sessionKey, authRequest).keep(result);
    return { state: 'sent', id: result.session.principal };
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
