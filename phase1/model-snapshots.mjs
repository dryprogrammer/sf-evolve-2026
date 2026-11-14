// Bridge for assistant text retrieved by the supported conversation-reading tool.
// This is agent-assisted snapshot import, not autonomous API polling or token streaming.
import {readFile,writeFile,rename,mkdir,open,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateMessage(message) {
  if(!message || message.role!=='assistant' || message.sourceTool!=='read_agent_conversation' ||
    !uuid.test(message.conversationId) || typeof message.text!=='string' ||
    !message.text.trim() || message.text.length>32000 ||
    typeof message.importedAt!=='string' || !Number.isFinite(Date.parse(message.importedAt)))
    throw new Error('Expected assistant text from read_agent_conversation, conversation UUID and import timestamp.');
  // The reader does not supply message IDs or per-message creation timestamps.
  // Do not invent either. Content identity can merge identical repeated messages.
  return {role:'assistant',conversationId:message.conversationId,text:message.text,
    sourceTool:'read_agent_conversation',importedAt:message.importedAt,
    contentId:createHash('sha256').update(message.conversationId+'\0'+message.text).digest('hex')};
}
export async function importSnapshots(input, destination) {
  if(!Array.isArray(input)||input.length<1||input.length>100)throw new Error('Import 1–100 assistant messages.');
  const now=new Date().toISOString();
  const messages=input.map(m=>validateMessage({...m,importedAt:now}));
  await mkdir(dirname(destination),{recursive:true,mode:0o700});
  // Atomic replace protects readers; this exclusive lock also protects concurrent writers.
  let lock;
  for(let attempt=0;attempt<40;attempt++){
    try {lock=await open(destination+'.lock','wx',0o600);break;}
    catch(e){if(e.code!=='EEXIST')throw e;await sleep(50);}
  }
  if(!lock)throw new Error('Snapshot importer is locked. If its process crashed, verify it stopped before removing the .lock file.');
  try {
  let previous=[];
  try {
    const snapshot=JSON.parse(await readFile(destination,'utf8'));
    if(snapshot.schemaVersion!==1||!Array.isArray(snapshot.messages))throw new Error('Invalid existing snapshot store.');
    previous=snapshot.messages.map(validateMessage);
  } catch(e) {if(e.code!=='ENOENT')throw e;}
  const merged=new Map(previous.map(m=>[m.contentId,m]));let added=0;
  for(const m of messages)if(!merged.has(m.contentId)){merged.set(m.contentId,m);added++;}
  const content=JSON.stringify({schemaVersion:1,messages:[...merged.values()].slice(-100)},null,2)+'\n';
  if(Buffer.byteLength(content)>2*1024*1024)throw new Error('Snapshot store exceeds 2 MiB.');
  await mkdir(dirname(destination),{recursive:true,mode:0o700});
  const temp=destination+'.'+randomUUID()+'.tmp';
  await writeFile(temp,content,{mode:0o600});await rename(temp,destination);
  return {added,retained:Math.min(merged.size,100),delivery:'agent-assisted snapshot import; not live tokens'};
  } finally {await lock.close();await unlink(destination+'.lock');}
}
export class ModelSnapshotCapture {
  constructor({file,emit}){this.file=file;this.emit=emit;this.seen=new Set();
    this.metrics={scans:0,errors:0,messages:0};}
  async scan(){
    this.metrics.scans++;
    try {
      const raw=await readFile(this.file,'utf8');
      if(Buffer.byteLength(raw)>2*1024*1024)throw new Error('Snapshot store exceeds 2 MiB.');
      const snapshot=JSON.parse(raw);
      if(snapshot.schemaVersion!==1||!Array.isArray(snapshot.messages)||snapshot.messages.length>100)
        throw new Error('Invalid snapshot store.');
      // Validate the entire document before dispatching anything.
      const messages=snapshot.messages.map(validateMessage);
      for(const m of messages){if(this.seen.has(m.contentId))continue;
        this.emit({type:'assistant.message.observed',source:'conversation-tool-snapshot',
          agent:m.conversationId,sourceAt:null,historical:true,
          summary:'Model-written assistant message · imported snapshot',
          payload:{...m,delivery:'agent-assisted snapshot import; not live tokens',
            sourceMessageId:null,generationTimestamp:null}});
        this.seen.add(m.contentId);this.metrics.messages++;
      }
    } catch(e){if(e.code!=='ENOENT'){this.metrics.errors++;this.metrics.lastError=String(e);}}
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw new Error('Usage: node phase1/model-snapshots.mjs INPUT.json [DESTINATION.json]');
  const input=JSON.parse(await readFile(process.argv[2],'utf8'));
  const destination=process.argv[3]??'.phase1-data/model-snapshots.json';
  console.log(JSON.stringify(await importSnapshots(input,destination)));
}
