import { checkSchema, validatePayload } from './record-validation.js';

export type Reference = { id: string; uri: string; revision: string };
export type Field = { name: string; label: string; control: string; maxItems: number; value: string; options: {value:string;label:string}[]; references: Reference[] };
export type Definition = { ref: string; digest: string; definition: any; referenceIds?:Record<string,string[]> };
export type Composition = { lexicon: { ref: string; digest: string }; audience: string; payload: Record<string, any>; definition: any; referenceIds?:Record<string,string[]> };
export function formFields(composition: Composition): Field[] {
  const {schema,presentation}=composition.definition;
  checkSchema(schema);
  if (schema.type!=='object' || schema.properties[presentation.bodyField]?.type!=='string') throw new Error('This format needs a newer composer. Your draft is kept.');
  return Object.entries(schema.properties).filter(([name])=>name!==presentation.bodyField).map(([name,raw])=>{
    const field=raw as any, hint=presentation.fields[name], value=composition.payload[name];
    const base={name,label:hint?.label||name,control:hint?.control||'',maxItems:field.maxItems||0,value:'',options:[],references:[]} as Field;
    if(hint?.control==='select' && field.type==='string' && Array.isArray(field.enum)) return {...base,value:value??'',options:[{value:'',label:'Choose…'},...field.enum.map((v:string)=>({value:v,label:v[0].toUpperCase()+v.slice(1)}))]};
    if(hint?.control==='text' && field.type==='string') return {...base,value:value??''};
    if(hint?.control==='references' && field.type==='array' && field.items?.type==='object' && field.items.properties?.uri?.type==='string' && field.items.properties?.revision?.type==='string' && Object.keys(field.items.properties).every(key=>['uri','revision'].includes(key)) && field.items.required.length===1 && field.items.required[0]==='uri') return {...base,references:(value??[]).map((r:any,i:number)=>({id:composition.referenceIds?.[name]?.[i]||`${name}-${i}`,uri:r.uri,revision:r.revision??''}))};
    throw new Error('This format needs a newer composer. Your draft is kept.');
  });
}
export function newComposition(selected:Definition,audience:string,body:string):Composition {
  const definition=selected.definition, payload:Record<string,any>={};
  for(const [name,raw] of Object.entries(definition.schema.properties)) payload[name]=(raw as any).type==='array'?[]:'';
  payload[definition.presentation.bodyField]=body;
  const result={lexicon:{ref:selected.ref,digest:selected.digest},audience,payload,definition};
  formFields(result); return result;
}
export function editedComposition(previous:Composition, audience:string, body:string, fields:Field[]):Composition {
  const payload:Record<string,any>={...previous.payload,[previous.definition.presentation.bodyField]:body};
  const known=formFields(previous);
  if(fields.length!==known.length || known.some(f=>!fields.some(v=>v.name===f.name))) throw new Error('The form changed. Your draft is kept.');
  for(const field of fields) payload[field.name]=field.control==='references'?field.references.map(r=>({uri:r.uri,...(r.revision?{revision:r.revision}:{})})):field.value;
  // JSON removes absent optional revisions; no user text is normalized.
  return {...previous,audience,payload:JSON.parse(JSON.stringify(payload)),referenceIds:Object.fromEntries(fields.filter(f=>f.control==='references').map(f=>[f.name,f.references.map(r=>r.id)]))};
}
export function compositionError(c:Composition):string {
  if(!c.audience)return 'Choose an audience.';
  try { validatePayload(c.definition.schema,c.payload); return ''; } catch(e) {
    const name=(e as Error).message.match(/^payload\.([^.[ :]+)/)?.[1];
    const field=name?c.definition.schema.properties[name]:null, label=name?(c.definition.presentation.fields[name]?.label||name):'Post';
    return field?.enum?`Choose ${label.toLowerCase()}.`:field?.type==='array'?`Check each ${label.toLowerCase()} entry.`:`Check ${label.toLowerCase()} before posting.`;
  }
}
