import assert from 'node:assert/strict';
import test from 'node:test';
import {DraftController} from '../lib/draft-controller.ts';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('Typing during draft restoration is preserved and saved to the original workspace',async()=>{
 const aRead=deferred(),aSave=deferred(),writes=[];
 const a=new DraftController({text:''},()=>aRead.promise,async(payload,version)=>{writes.push({scope:'a',payload,version});return aSave.promise;});
 const pending=a.load();a.update({text:'Unsaved A'});
 const b=new DraftController({text:''},async()=>({draft:{payload:{text:'Saved B'},version:3}}),async()=>({version:4}));await b.load();
 aRead.resolve({draft:{payload:{text:'Old A'},version:2}});await Promise.resolve();await Promise.resolve();
 assert.equal(a.snapshot.value.text,'Unsaved A');assert.equal(b.snapshot.value.text,'Saved B');assert.equal(writes[0].version,2);
 a.update({text:'Newest A'});aSave.resolve({version:3});await pending;assert.equal(writes.at(-1).payload.text,'Newest A');assert.equal(b.snapshot.value.text,'Saved B');
});
test('A conflicting save keeps the user draft and stops blind overwrites',async()=>{
 let calls=0;const d=new DraftController({text:''},async()=>({draft:null}),async()=>{calls++;throw new Error('A newer draft exists.');});await d.load();d.update({text:'Keep me'});await d.flush();await d.flush();assert.equal(calls,1);assert.equal(d.snapshot.value.text,'Keep me');assert.equal(d.snapshot.conflict,true);
});
test('Clearing after submission does not resurrect an in-flight draft',async()=>{
 const save=deferred(),writes=[];const d=new DraftController({text:''},async()=>({draft:null}),async(value,version)=>{writes.push({value,version});return writes.length===1?save.promise:{version:version+1};});await d.load();d.update({text:'Submitted'});const pending=d.flush(),clear=d.clear();save.resolve({version:1});await Promise.all([pending,clear]);assert.equal(writes.at(-1).value.text,'');assert.equal(writes.at(-1).version,1);assert.equal(d.snapshot.dirty,false);
});
