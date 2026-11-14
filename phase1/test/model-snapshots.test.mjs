import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importSnapshots,ModelSnapshotCapture,validateMessage} from '../model-snapshots.mjs';
import {startInspector} from '../server.mjs';
const conversationId='a538b4eb-cf24-5ff4-a694-7f8973b4d0b0';
const message=text=>({role:'assistant',sourceTool:'read_agent_conversation',conversationId,text});
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'phase1-model-fixture-'));t.after(()=>rm(root,{recursive:true,force:true}));return {root,file:join(root,'snapshots.json')};}
test('snapshot preserves model text, null timing and snapshot provenance; repeats deduplicate',async t=>{
 const {file}=await fixture(t),events=[];
 const result=await importSnapshots([message('Test fixture: model text 🤖\n<script>not executable</script>')],file);
 assert.equal(result.added,1);assert.equal((await importSnapshots([message('Test fixture: model text 🤖\n<script>not executable</script>')],file)).added,0);
 const capture=new ModelSnapshotCapture({file,emit:e=>events.push(e)});await capture.scan();await capture.scan();
 assert.equal(events.length,1);const e=events[0];assert.equal(e.type,'assistant.message.observed');assert.equal(e.source,'conversation-tool-snapshot');assert.equal(e.sourceAt,null);assert.equal(e.historical,true);assert.equal(e.payload.generationTimestamp,null);assert.equal(e.payload.sourceMessageId,null);assert.match(e.payload.delivery,/not live tokens/);assert.equal(e.payload.text,'Test fixture: model text 🤖\n<script>not executable</script>');
});
test('rejects user/tool text, wrong source, invalid UUID and oversize without writing',async t=>{
 const {file}=await fixture(t);for(const extra of [{role:'user'},{sourceTool:'exec'},{conversationId:'invalid'},{text:'x'.repeat(32001)}])await assert.rejects(importSnapshots([{...message('fixture'),...extra}],file));
 await assert.rejects(readFile(file));assert.throws(()=>validateMessage({...message('fixture'),importedAt:'bad timestamp'}));
});
test('concurrent imports preserve both messages',async t=>{
 const {file}=await fixture(t);await Promise.all([importSnapshots([message('first fixture')],file),importSnapshots([message('second fixture')],file)]);
 const data=JSON.parse(await readFile(file,'utf8'));assert.equal(data.messages.length,2);assert.deepEqual(new Set(data.messages.map(m=>m.text)),new Set(['first fixture','second fixture']));
});
test('missing files are normal; malformed snapshots recover without partial dispatch',async t=>{
 const {file}=await fixture(t),events=[];const capture=new ModelSnapshotCapture({file,emit:e=>events.push(e)});await capture.scan();assert.equal(capture.metrics.errors,0);
 await writeFile(file,JSON.stringify({schemaVersion:1,messages:[{...message('valid fixture'),importedAt:new Date().toISOString()},message('missing timestamp')]}));await capture.scan();assert.equal(capture.metrics.errors,1);assert.equal(events.length,0);
 await writeFile(file,JSON.stringify({schemaVersion:1,messages:[{...message('valid fixture'),importedAt:new Date().toISOString()}]}));await capture.scan();assert.equal(events.length,1);
});
test('retains latest 100 snapshots and rejects larger input batches',async t=>{
 const {file}=await fixture(t);await assert.rejects(importSnapshots(Array.from({length:101},(_,i)=>message('fixture '+i)),file));
 await importSnapshots(Array.from({length:100},(_,i)=>message('fixture '+i)),file);await importSnapshots([message('new fixture')],file);const data=JSON.parse(await readFile(file,'utf8'));assert.equal(data.messages.length,100);assert.equal(data.messages[0].text,'fixture 1');
});
test('model snapshots reach read-only inspector without invented model latency or completion',async t=>{
 const {root,file}=await fixture(t);await importSnapshots([message('integration fixture assistant response')],file);
 const app=await startInspector({port:0,root,dataDir:join(root,'data'),modelSnapshotFile:file,interval:10000});t.after(()=>app.close());
 const events=await(await fetch(app.url+'/api/events')).json();const e=events.find(e=>e.type==='assistant.message.observed');assert.equal(e.payload.text,'integration fixture assistant response');assert.equal(e.captureLatencyMs,null);
 const metrics=await(await fetch(app.url+'/api/metrics')).json();assert.equal(metrics.modelSnapshots.messages,1);assert.match(metrics.capabilities.modelOutput,/not token streaming/);assert.equal(metrics.capabilities.agentTurnCompletion,'unavailable in this fallback');
 const response=await fetch(app.url+'/events');const reader=response.body.getReader();const data=new TextDecoder().decode((await reader.read()).value);assert.match(data,/assistant.message.observed/);await reader.cancel();
});
