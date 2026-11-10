import { privateView, publicView, writingDefinitions } from './private-definition.ts';
import { newComposition, type Definition } from './composition.ts';
import { draftScope, type Drafts, type Draft, newIntent, syncScope, type Request, type Mode, type PostRecord } from './social-data.ts';

export type View = { schemaVersion: number; id: string; version: number; sources: string[]; select: {lexicons:{ref:string;digest:string}[];visibility?:string}; presentation:{order:string;group:string}; compose:null|{destination:string;audience:string;lexicons:{ref:string;digest:string}[];defaultLexicon:string} };
// Labels are presentation metadata, never storage keys or permission grants.
export const viewChoices = [{id:'public',label:'Public'}, {id:'private',label:'Personal'}];
export function selectedView(id:string):View {
  const view = [publicView,privateView].find(v=>v.id===id);
  if(!view)throw new Error('This view is unavailable. Your draft is kept.');
  return view;
}
export function writingPolicy(view:View, definitions:Definition[]=writingDefinitions) {
  if(!view.compose)return null;
  if(view.compose.destination!=='network' || !view.sources.includes('network'))throw new Error('This writing destination is unavailable. Your draft is kept.');
  // These are the two configured audience bindings, independent of the view ID.
  if(!['public','private'].includes(view.compose.audience))throw new Error('This audience binding is unavailable. Your draft is kept.');
  const ref=view.compose.lexicons.find(l=>l.ref===view.compose!.defaultLexicon);
  const definition=definitions.find(l=>l.ref===ref?.ref && l.digest===ref.digest);
  if(!definition)throw new Error('This writing format is unavailable. Your draft is kept.');
  return {mode:view.compose.audience as Mode,definition};
}
export function writingKey(view:View) {
  // Cosmetic names and read filters do not change a draft's writing context.
  return JSON.stringify({id:view.id,compose:view.compose});
}
export function selectPosts(view:View, authorized:PostRecord[]) {
  if(view.sources.some(source=>source!=='network') || view.presentation.order!=='newest-first' || !['thread','none'].includes(view.presentation.group))throw new Error('This view needs an unavailable source or presentation.');
  const selected=authorized.filter(p=>(!view.select.visibility || view.select.visibility==='all' || p.visibility===view.select.visibility) && (!view.select.lexicons.length || view.select.lexicons.some(l=>l.ref===p.lexicon && l.digest===p.lexiconDigest)));
  const ids=new Set(selected.map(p=>p.id)), visible=new Set(ids), byId=new Map(authorized.map(p=>[p.id,p]));
  // Readable ancestors provide conversation context; never add an unreadable one.
  for(const p of selected){let parent=p.parent;const seen=new Set<string>();while(parent && !seen.has(parent)){seen.add(parent);const row=byId.get(parent);if(!row)break;visible.add(parent);parent=row.parent;}}
  const feed=new Set(selected.filter(p=>!p.deleted && (view.presentation.group==='none' || !p.parent || !ids.has(p.parent))).map(p=>p.id));
  return {records:authorized.filter(p=>visible.has(p.id)),feed};
}
export function assertDraftContext(view:View,draft:Draft) {
  if(draft.sealed)return; // Retry exactly; the previous intent owns its context.
  if(draft.viewContext && draft.viewContext!==writingKey(view))throw new Error('This view’s writing settings changed. Your original draft is kept.');
  const policy=writingPolicy(view);
  if(!policy)throw new Error('This view is read-only. Your draft is kept.');
  if(draft.composition && (!view.compose!.lexicons.some(l=>l.ref===draft.composition!.lexicon.ref && l.digest===draft.composition!.lexicon.digest) || (draft.composition.audience===null)!==(policy.mode==='public')))throw new Error('This draft belongs to a different writing context. Your original draft is kept.');
}
export async function prepareViewDraft(drafts:Drafts,view:View,parent:string) {
  const scope=draftScope(view.id,parent);
  const initial=await drafts.get(scope);
  return drafts.use(v=>{
    const current=v.drafts[scope] || initial;
    if(current?.sealed)return current;
    const draft=current;
    assertDraftContext(view,draft);
    if(!current.viewContext){
      const policy=writingPolicy(view)!;
      current.viewContext=writingKey(view);
      if(!current.composition)current.composition=newComposition(policy.definition,policy.mode==='public'?null:'',current.body);
      if(current.body)current.revision+=1;
      v.drafts[scope]=current;
    }
    return current;
  },true);
}

// Old versions shared one reply branch across modes. Only positively identified
// Public drafts move; ambiguous body-only drafts retain their Personal home.
export async function adoptLegacyPublicReply(drafts:Drafts,parent:string,request?:Request) {
  if(!parent)return;
  const legacy=draftScope('private',parent), target=draftScope('public',parent);
  const existing=await drafts.get(target);
  if(existing.revision || existing.body || existing.sealed)return;
  if(request){try {await syncScope(request,drafts,legacy);}catch { /* Local recovery still works offline. */ }}
  await drafts.use(v=>{
    const old=v.drafts[legacy];
    if(!old || (!old.sealed && (!old.composition || old.composition.audience!==null)) || (old.sealed && old.sealed.visibility!=='public'))return;
    const current=v.drafts[target];
    if(current && (current.revision || current.body || current.sealed))return;
    v.drafts[target]={...old,syncedRevision:0,cloudRevision:0};
    v.drafts[`retained:legacy:${old.intent}`]={...old};
    // A new empty revision retires the old cloud branch without discarding its
    // locally retained original. A sealed retry still carries its old scope.
    v.drafts[legacy]={body:'',revision:old.revision+1,intent:newIntent(),sealed:null,syncedRevision:0,cloudRevision:old.cloudRevision||0};
  },true);
}
