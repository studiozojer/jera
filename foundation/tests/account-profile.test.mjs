import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAccountProfile} from '../app/account-profile.ts';
const alice='did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', bob='did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
const photo='https://cdn.bsky.app/img/avatar/plain/alice/example';
function storage() {
 const files=new Map();
 return {files,fs:{readFile:async path=>{if(!files.has(path)) throw new Error('ENOENT');return files.get(path);},atomicWriteFile:async(path,data)=>files.set(path,data)}};
}
const offline=async()=>{throw new Error('offline');};
test('verified DID selects the public profile without sending credentials, and caches it for offline use',async()=>{
 const disk=storage();
 const profile=await loadAccountProfile(alice,disk,async(url,init)=>{
  assert.equal(new URL(url).searchParams.get('actor'),alice);
  assert.equal(init.headers,undefined);
  assert.equal(init.exactTimeout,5000);
  return Response.json({did:alice,handle:'alice.test',displayName:'Alice',avatar:photo});
 });
 assert.deepEqual(profile,{principal:alice,name:'Alice',handle:'alice.test',avatar:photo});
 assert.deepEqual(await loadAccountProfile(alice,disk,offline),profile);
 assert.deepEqual(await loadAccountProfile(bob,disk,offline),{principal:bob,name:'Your account',handle:'',avatar:''});
});
test('mismatched profile identity and unsafe photo URLs never enter another account lockup',async()=>{
 const disk=storage();
 const mismatch=await loadAccountProfile(alice,disk,async()=>Response.json({did:bob,handle:'bob.test',displayName:'Bob',avatar:photo}));
 assert.equal(mismatch.name,'Your account');assert.equal(disk.files.size,0);
 const profile=await loadAccountProfile(alice,disk,async()=>Response.json({did:alice,handle:'alice.test',avatar:'https://cdn.bsky.app.attacker.test/img/avatar/tracker'}));
 assert.equal(profile.name,'alice.test');assert.equal(profile.avatar,'');
});
test('signed-out lookup does nothing; an unwritable cache does not hide the current profile',async()=>{
 const disk={fs:{readFile:offline,atomicWriteFile:offline}};
 let calls=0;
 const fetcher=async()=>{calls++;return Response.json({did:alice,handle:'alice.test'});};
 await loadAccountProfile('',disk,fetcher);assert.equal(calls,0);
 assert.equal((await loadAccountProfile(alice,disk,fetcher)).handle,'alice.test');
});
