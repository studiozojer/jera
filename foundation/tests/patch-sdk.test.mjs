import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {patchSDK} from '../scripts/patch-sdk.mjs';

test('recorded compatibility patches apply to the pinned base and repeat unchanged',()=>{
 const root=mkdtempSync(join(tmpdir(),'jera-sdk-patches-'));
 const sdk=fileURLToPath(new URL('../../tooling/exact2',import.meta.url));
 const files=['host/apple/Sources/ExactKit/AudioSession.swift','host/apple/Sources/ExactKit/IOS/TintDimmingIOS.swift','host/web/auth-glue.js'];
 try{
  for(const path of files){mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),execFileSync('git',['-C',sdk,'show',`HEAD:${path}`]));}
  patchSDK(root);
  const first=files.map(path=>readFileSync(join(root,path),'utf8'));
  patchSDK(root);
  assert.deepEqual(files.map(path=>readFileSync(join(root,path),'utf8')),first);
  assert.match(first[2],/if \(channel\) return;/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
