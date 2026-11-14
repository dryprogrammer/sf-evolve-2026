import http from 'node:http';
import {randomUUID} from 'node:crypto';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { CommandCapture } from './capture.mjs';
import { ModelSnapshotCapture } from './model-snapshots.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
export async function startInspector({port=4318,host='127.0.0.1',root='/tmp/commands',interval=250,
  dataDir=join(dir,'../.phase1-data'),agentMap={},commandAgentMap={},identityFile=null,modelSnapshotFile=null,includeHistory=false}={}) {
  await mkdir(dataDir,{recursive:true,mode:0o700});
  const events=[], clients=new Set(); let seq=0, persistence=Promise.resolve(), writeErrors=0;
  const runId=randomUUID();
  const began=Date.now(), initialCpu=process.cpuUsage();
  const emit = event => {
    const capturedAt = new Date().toISOString();
    const sourceMs = event.sourceAt ? Date.parse(event.sourceAt) : NaN;
    const item = {...event,id:++seq,capturedAt,
      captureLatencyMs:Number.isFinite(sourceMs) ? Date.parse(capturedAt)-sourceMs : null};
    events.push(item); if(events.length>2000) events.shift();
    const line=JSON.stringify(item);
    persistence=persistence.then(()=>appendFile(join(dataDir,'events.jsonl'),line+'\n',{mode:0o600}))
      .catch(()=>{writeErrors++;});
    for (const res of clients) {
      if (!res.write(`id: ${runId}:${item.id}\ndata: ${line}\n\n`)) {clients.delete(res);res.destroy();}
    }
    return item;
  };
  const capture = new CommandCapture({root,emit,agentMap,commandAgentMap,includeHistory});
  const modelCapture=new ModelSnapshotCapture({file:modelSnapshotFile??join(dataDir,'model-snapshots.json'),emit});
  const metrics = () => ({runId,mode:'workspace-exec + imported conversation snapshots',uptimeMs:Date.now()-began,
    eventCount:seq,retainedEvents:events.length,clients:clients.size,writeErrors,
    cpu:process.cpuUsage(initialCpu),rssBytes:process.memoryUsage().rss,
    modelSnapshots:{...modelCapture.metrics,delivery:'agent-assisted snapshot import; not live tokens'},
    capture:{...capture.metrics,averageScanMs:capture.metrics.scanMs/Math.max(capture.metrics.scans,1)},
    capabilities:{execLifecycle:'verified locally',execOutput:'verified locally',
      modelOutput:'assistant text via agent-assisted conversation snapshots; not token streaming',
      agentState:'unavailable',agentTurnCompletion:'unavailable in this fallback',steering:'disabled; unverified'}});
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    // Read-only service: no arbitrary shell, remote fetch, write API or steering endpoint.
    if(req.method!=='GET'){res.writeHead(405);res.end('Read-only inspector');return;}
    res.setHeader('X-Content-Type-Options','nosniff');
    if(url.pathname==='/events') {
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
      const lastId=req.headers['last-event-id'];
      const [epoch,number]=String(lastId??'').split(':');
      const cursor=epoch===runId ? Number(number)||0 : 0;
      if(lastId && epoch!==runId)res.write('event: gap\ndata: {"reason":"Collector restarted; replay is not durable"}\n\n');
      if(cursor && events.length && cursor<events[0].id-1)
        res.write(`event: gap\ndata: ${JSON.stringify({reason:'Replay window exceeded',oldestId:events[0].id})}\n\n`);
      for(const e of events) if(e.id>cursor)res.write(`id: ${runId}:${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
      clients.add(res); req.on('close',()=>clients.delete(res)); return;
    }
    if(url.pathname==='/api/events'||url.pathname==='/api/metrics'){
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify(url.pathname==='/api/events'?events:metrics()));return;
    }
    if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(url.pathname!=='/'){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' http://127.0.0.1:4318 http://localhost:4318; object-src 'none'; base-uri 'none'"});
    res.end(await readFile(join(dir,'inspector.html')));
  });
  await capture.scan();await modelCapture.scan();
  let scanning=false;
  const timer=setInterval(async()=>{if(scanning)return;scanning=true;try{
      if(identityFile) {
        try {
          capture.commandAgentMap=JSON.parse(await readFile(identityFile,'utf8'));
          // Explicit command-to-conversation binding; generations can be shared by subagents.
          for(const e of events) if(capture.commandAgentMap[e.commandId])e.agent=capture.commandAgentMap[e.commandId];
        } catch (e) {capture.metrics.errors++;capture.metrics.identityErrors++;capture.metrics.lastError=String(e);}
      }
      await capture.scan();await modelCapture.scan();}finally{scanning=false;}},interval);
  const heartbeat=setInterval(()=>{for(const res of clients)res.write(': heartbeat\n\n');},5000);
  await new Promise(resolve=>server.listen(port,host,resolve));
  return {server,capture,events,emit,metrics,runId,url:`http://${host}:${server.address().port}`,
    async close(){clearInterval(timer);clearInterval(heartbeat);for(const res of clients)res.end();
      await new Promise(resolve=>server.close(resolve));await persistence;}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const app=await startInspector({port:Number(process.env.INSPECTOR_PORT??4318),
    host:process.env.INSPECTOR_HOST??'127.0.0.1',dataDir:process.env.INSPECTOR_DATA_DIR??join(dir,'../.phase1-data'),root:process.env.COMMAND_ROOT??'/tmp/commands',
    agentMap:JSON.parse(process.env.AGENT_MAP??'{}'),identityFile:process.env.COMMAND_AGENT_MAP_PATH??null,modelSnapshotFile:process.env.MODEL_SNAPSHOT_FILE??null,includeHistory:process.env.INCLUDE_HISTORY==='1'});
  console.log(`Live inspector: ${app.url} (read-only; exec feed + imported model snapshots)`);
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{await app.close();process.exit(0);});
}
