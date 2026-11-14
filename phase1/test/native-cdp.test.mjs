import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
const source=await readFile(new URL('../native-cdp-capture.js',import.meta.url),'utf8');
const capture=vm.runInNewContext(`(${source})`,{});
const project='project-id',conversation='conversation-id';
async function run(chunks,{buffered='',wrongConversation=false,finished=false}={}){
 const session=new EventEmitter();let detached=false;
 session.send=async(method)=>method==='Network.streamResourceContent'?{bufferedData:Buffer.from(buffered).toString('base64')}:{};
 session.detach=async()=>{detached=true;};
 const page={url:()=>`https://factory.8090.ai/project/${project}/agents/${conversation}`,context:()=>({newCDPSession:async()=>session}),
  reload:async()=>{session.emit('Network.requestWillBeSent',{requestId:'r',request:{url:`https://api.factory.8090.dev/v2/project/${project}/agents/chat-agent/stream`,method:'POST',postData:JSON.stringify({conversation_id:wrongConversation?'other':conversation})}});session.emit('Network.responseReceived',{requestId:'r',response:{status:200,mimeType:'text/event-stream'}});await Promise.resolve();},
  waitForTimeout:async()=>{await new Promise(r=>setTimeout(r,1000));for(const c of chunks)session.emit('Network.dataReceived',{requestId:'r',data:Buffer.from(c).toString('base64')});if(finished)session.emit('Network.loadingFinished',{requestId:'r'});}};
 const result=await capture(page,{durationMs:1000});assert.equal(detached,true);assert.equal(session.eventNames().length,0);return result;
}
const frame=e=>`id: event-id\r\ndata: ${JSON.stringify(e)}\r\n\r\n`;
const content={type:'content',turn_id:'t',message_id:'m',part_id:'p',content_offset:0,delta:'Hello 👩🏽‍💻 — café'};
test('sandbox-safe native capture preserves split UTF-8 and marks wire arrival before finish',async()=>{
 const bytes=Buffer.from(frame(content));const chunks=Array.from(bytes,b=>Buffer.from([b]));
 const x=await run(chunks,{finished:true});assert.equal(x.frames.length,1);assert.equal(x.frames[0].delta,content.delta);
 assert.equal(x.frames[0].delivery,'incremental');assert.equal(x.frames[0].beforeResponseFinished,true);
 assert.equal(x.frames[0].sourceAt,null);assert.equal(x.responsesStillOpen,0);assert.equal(x.errors.length,0);
});
test('buffered replay is labeled and excluded thinking/history payloads never leave capture',async()=>{
 const x=await run([],{buffered:frame({type:'thinking',delta:'PRIVATE'})+frame({type:'history',events:[{delta:'PRIVATE'}]})+frame(content)});
 assert.equal(x.frames[0].delivery,'buffered-at-attach');assert.equal(x.frames.length,1);assert.equal(JSON.stringify(x).includes('PRIVATE'),false);
});
test('rejects association with a different conversation',async()=>{
 const x=await run([frame(content)],{wrongConversation:true});assert.equal(x.frames.length,0);assert.equal(x.requests.length,0);
});
test('source status and instruction IDs are distinct from tool completion or compliance',async()=>{
 const x=await run([frame({type:'status',is_streaming:true,turn_id:'t'})+frame({type:'steer_message',id:'input-id',turn_id:'t',content:'Do not export'})]);
 assert.equal(x.frames[0].isStreaming,true);assert.equal(x.frames[1].inputId,'input-id');assert.equal(JSON.stringify(x).includes('Do not export'),false);
});
