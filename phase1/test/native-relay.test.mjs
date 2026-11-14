import test from 'node:test';import assert from 'node:assert/strict';
import {NativeRelay,validateNativeBatch} from '../native-relay.mjs';
import {startInspector} from '../server.mjs';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const scope={projectId:'p',conversationIds:['c']};
const frame={type:'content',eventId:'e',requestId:'r',receivedAt:new Date().toISOString(),delivery:'incremental',beforeResponseFinished:true,turnId:'t',messageId:'m',partId:'part',offset:0,delta:'actual text'};
const batch=frames=>({projectId:'p',conversationId:'c',frames});
test('scope and entire batch validation precede dispatch',()=>{
 const emitted=[];const relay=new NativeRelay({emit:e=>emitted.push(e)});
 assert.throws(()=>relay.accept({...batch([frame]),conversationId:'other'},scope));
 assert.throws(()=>relay.accept(batch([frame,{...frame,type:'thinking'}]),scope));assert.equal(emitted.length,0);
});
test('source dedup, missing-prefix gaps and source status remain honest',()=>{
 const emitted=[];const relay=new NativeRelay({emit:e=>emitted.push(e)});
 relay.accept(batch([frame,frame]),scope);assert.equal(relay.metrics.duplicates,1);
 relay.accept(batch([{...frame,eventId:'gap',offset:100,delta:'gap'}]),scope);
 assert.equal(relay.snapshots().parts[0].gap,true);assert.equal(relay.snapshots().parts[0].text,'actual text');
 relay.accept(batch([{...frame,type:'status',eventId:null,isStreaming:false,stateRevision:'opaque'}]),scope);
 assert.equal(relay.snapshots().states[0].sourceReportedRunning,false);assert.equal(relay.snapshots().states[0].reconciled,false);
});
test('unknown fields and reasoning payloads are never forwarded',()=>{
 const x=validateNativeBatch(batch([{...frame,thinking:'PRIVATE'}]),scope);assert.equal(JSON.stringify(x).includes('PRIVATE'),false);
});
test('loopback ingress requires explicit scope, rejects browser origins and retains no control API',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'native-relay-'));const app=await startInspector({port:0,root:join(dir,'no-commands'),dataDir:dir});
 const post=(body,headers={})=>fetch(app.url+'/api/native',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{
  assert.equal((await post(batch([frame]))).status,400);
  await writeFile(join(dir,'native-scope.json'),JSON.stringify(scope));
  assert.equal((await post(batch([frame]),{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await post({...batch([frame]),conversationId:'other'})).status,400);
  assert.equal((await post(batch([frame]))).status,200);
  const x=await(await fetch(app.url+'/api/native')).json();assert.equal(x.parts[0].text,'actual text');
  assert.equal((await fetch(app.url+'/steer',{method:'POST'})).status,405);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
