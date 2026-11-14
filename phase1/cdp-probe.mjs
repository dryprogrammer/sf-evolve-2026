import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
const binary=process.argv[2];
if(!binary)throw new Error('Supply the disposable Chromium binary');
const profile=await mkdtemp(join(tmpdir(),'phase1-own-cdp-'));
const child=spawn(binary,['--no-sandbox','--disable-dev-shm-usage','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let browserLog='';child.stderr.on('data',b=>browserLog+=b);let socket;const pending=new Map();let sequence=0;
const result={probeId:randomUUID(),checkedAt:new Date().toISOString(),scope:'Independent disposable Chromium; actual local inspector SSE, NOT authenticated native 8090 model traffic',newRemoteApiRequests:0,readsCredentials:false,streamMethod:'Network.streamResourceContent on Fetch response',responseStatus:null,fetchFinished:false,bufferedBytes:0,incrementalChunks:0,incrementalBytes:0,markers:[]};
try {
 let port;
 for(let i=0;i<100;i++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{if(child.exitCode!==null)throw Error('Chromium exited: '+browserLog.slice(-1500));await sleep(100);}}
 if(!port)throw Error('Disposable CDP port unavailable');
 result.browserVersion=(await(await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser;
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();const target=targets.find(t=>t.type==='page');
 socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},5000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 let requestId=null,enablePromise=null,buffer='',decoder=new TextDecoder();const seen=new Set();
 const parse=bytes=>{buffer+=decoder.decode(bytes,{stream:true});let cut;while((cut=buffer.indexOf('\n\n'))!==-1){const frame=buffer.slice(0,cut);buffer=buffer.slice(cut+2);const text=frame.split('\n').filter(l=>l.startsWith('data: ')).map(l=>l.slice(6)).join('\n');if(!text)continue;let event;try{event=JSON.parse(text);}catch{continue;}
 if(event.type!=='tool.output')continue;
 for(const line of (event.payload?.text??'').split('\n')){let marker;try{marker=JSON.parse(line);}catch{continue;}if(marker.kind!=='CDP_PROBE_MARKER'||marker.probeId!==result.probeId||seen.has(marker.index))continue;seen.add(marker.index);const receivedAt=new Date().toISOString();result.markers.push({index:marker.index,producerAt:marker.producerAt,capturedAt:event.capturedAt,cdpReceivedAt:receivedAt,latencyMs:Date.parse(receivedAt)-Date.parse(marker.producerAt),beforeFetchFinished:!result.fetchFinished});}
 }};
 socket.addEventListener('message',message=>{const event=JSON.parse(message.data);if(event.id){const p=pending.get(event.id);if(p){clearTimeout(p.timer);pending.delete(event.id);event.error?p.reject(Error(event.error.message)):p.resolve(event.result);}return;}
 const p=event.params;
 if(event.method==='Network.responseReceived'&&p.type==='Fetch'&&p.response.url==='http://127.0.0.1:4318/events'){
 requestId=p.requestId;result.responseStatus=p.response.status;
 enablePromise=send('Network.streamResourceContent',{requestId}).then(r=>{const bytes=Buffer.from(r.bufferedData??'','base64');result.bufferedBytes=bytes.length;parse(bytes);}).catch(e=>{result.streamError=String(e);});
 }
 if(event.method==='Network.dataReceived'&&p.requestId===requestId&&p.data){const bytes=Buffer.from(p.data,'base64');result.incrementalChunks++;result.incrementalBytes+=bytes.length;parse(bytes);}
 if(event.method==='Network.loadingFinished'&&p.requestId===requestId)result.fetchFinished=true;
 });
 await send('Network.enable',{maxTotalBufferSize:10485760,maxResourceBufferSize:1048576});
 await send('Page.navigate',{url:'http://127.0.0.1:4318/'});await sleep(1000);
 // Start a normal browser Fetch stream, like the 8090 frontend does. No remote API request.
 await send('Runtime.evaluate',{expression:"window.cdpProbeAbort=new AbortController();fetch('/events',{signal:window.cdpProbeAbort.signal}).then(async r=>{const reader=r.body.getReader();while(!(await reader.read()).done){}}).catch(()=>{});undefined;"});
 await sleep(500);if(enablePromise)await enablePromise;if(result.streamError)throw Error(result.streamError);
 for(let index=0;index<6;index++){console.log(JSON.stringify({kind:'CDP_PROBE_MARKER',probeId:result.probeId,producerAt:new Date().toISOString(),index}));await sleep(500);}
 await sleep(1500);
 result.pass=result.responseStatus===200&&result.incrementalChunks>0&&result.markers.length===6&&result.markers.every(m=>m.beforeFetchFinished)&&!result.fetchFinished;
 await send('Runtime.evaluate',{expression:'window.cdpProbeAbort.abort();undefined;'});
 if(!result.pass)throw Error('CDP did not capture all markers before stream end');
 await writeFile(new URL('./evidence/cdp-local-probe.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
} catch(error){result.pass=false;result.error=String(error);console.error(JSON.stringify(result,null,2));process.exitCode=1;}
finally {for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CDP cleanup'));}if(socket)socket.close();child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(2000)]);await rm(profile,{recursive:true,force:true});}
