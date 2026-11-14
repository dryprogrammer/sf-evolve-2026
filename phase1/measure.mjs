// Analyze genuine captured stdout against producer-stamped lines; never fabricate output timestamps.
import {readFile,writeFile} from 'node:fs/promises';
const input=process.argv[2]??'.phase1-data/events.jsonl';
const output=process.argv[3]??'phase1/evidence/live-measurement.json';
const since=process.argv[4]??'1970-01-01T00:00:00Z';
const events=(await readFile(input,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse).filter(e=>Date.parse(e.capturedAt)>=Date.parse(since));
const byCommand=new Map(), samples=[];
for(const e of events) {
 if(e.type!=='tool.output')continue;
 const state=byCommand.get(e.commandId)??{text:'',parts:[]};
 state.text+=e.payload.text;
 state.parts.push({end:state.text.length,capturedAt:e.capturedAt,id:e.id});
 byCommand.set(e.commandId,state);
}
for(const [commandId,state] of byCommand){let offset=0;for(const line of state.text.split('\n')){
 offset+=line.length+1;let p;try{p=JSON.parse(line);}catch{continue;}
 if(!p.producerAt||!['parent-verification','second-agent-audit'].includes(p.probe))continue;
 const captured=state.parts.find(part=>part.end>=offset-1);if(!captured)continue;
 samples.push({commandId,probe:p.probe,sequence:p.sequence??p.pattern,producerAt:p.producerAt,
  capturedAt:captured.capturedAt,latencyMs:Date.parse(captured.capturedAt)-Date.parse(p.producerAt),eventId:captured.id});
}}
const distribution=values=>{const s=values.sort((a,b)=>a-b);return {count:s.length,minMs:s[0]??null,
 p50Ms:s[Math.ceil(s.length*.5)-1]??null,p95Ms:s[Math.ceil(s.length*.95)-1]??null,maxMs:s.at(-1)??null};};
const metrics=await(await fetch('http://127.0.0.1:4318/api/metrics')).json();
const counts=Object.fromEntries(['parent-verification','second-agent-audit'].map(probe=>[probe,samples.filter(s=>s.probe===probe).length]));
const result={measuredAt:new Date().toISOString(),since,scope:'Actual 8090 parent/subagent exec outputs in one shared workspace; not native platform SSE',
 timestamps:'Producer and capture clocks share this workspace. Output latency computed only for explicit producerAt markers.',
 distribution:distribution(samples.map(s=>s.latencyMs)),counts,metrics,
 lifecycle:distribution(events.filter(e=>!e.historical&&e.captureLatencyMs!==null).map(e=>e.captureLatencyMs)),samples};
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,samples:undefined},null,2));
