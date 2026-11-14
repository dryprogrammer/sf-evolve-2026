import { readdir, readFile, stat, open } from 'node:fs/promises';
import { join } from 'node:path';

// Read-only fallback: these are real exec tool files, not agent-wide state.
export class CommandCapture {
  constructor({root, emit, agentMap = {}, commandAgentMap = {}, includeHistory = false, maxChunk = 16384}) {
    Object.assign(this, {root, emit, agentMap, commandAgentMap, includeHistory, maxChunk});
    this.seen = new Map(); this.firstScan = true;
    this.metrics = {scans:0, errors:0, bytes:0, scanMs:0, maxScanMs:0};
  }
  async scan() {
    const begin = performance.now();
    try {
      for (const id of await readdir(this.root)) {
        let meta;
        try {meta = JSON.parse(await readFile(join(this.root,id,'metadata.json'),'utf8'));}
        catch (e) {if (e.code !== 'ENOENT') this.metrics.errors++; continue;}
        if (!meta.command_id || !meta.generation_id) continue;
        const file = join(this.root,id,'output.log');
        let size;
        try {size = (await stat(file)).size;} catch {this.metrics.errors++; continue;}
        const old = this.seen.get(id);
        if (!old && this.firstScan && !this.includeHistory) {
          this.seen.set(id,{offset:size,status:meta.status}); continue;
        }
        const agent = this.commandAgentMap[meta.command_id] ?? this.agentMap[meta.generation_id] ?? `workspace-generation:${meta.generation_id}`;
        const base = {agent, generationId:meta.generation_id, commandId:meta.command_id,
          source:'workspace-exec', summary:meta.summary, historical:!old && this.firstScan};
        const state = old ?? {offset:0,status:null};
        if (!old) this.emit({...base,type:'tool.started',sourceAt:meta.started_at,payload:{tool:'exec'}});
        if (size < state.offset) {
          this.emit({...base,type:'capture.log_reset',sourceAt:null,payload:{previousOffset:state.offset,size}});
          state.offset=0;
        }
        if (size > state.offset) {
          const handle = await open(file,'r');
          try {
            while (state.offset < size) {
              const buffer = Buffer.alloc(Math.min(size-state.offset,this.maxChunk));
              const {bytesRead} = await handle.read(buffer,0,buffer.length,state.offset);
              if (!bytesRead) break;
              state.offset += bytesRead; this.metrics.bytes += bytesRead;
              // No producer timestamp in ordinary output: never invent source latency.
              this.emit({...base,type:'tool.output',sourceAt:null,
                payload:{text:buffer.subarray(0,bytesRead).toString('utf8'),offset:state.offset}});
            }
          } finally {await handle.close();}
        }
        if (meta.status !== state.status && meta.status !== 'running')
          this.emit({...base,type:'tool.completed',sourceAt:meta.ended_at ?? null,
            payload:{status:meta.status,exitCode:meta.exit_code}});
        state.status=meta.status; this.seen.set(id,state);
      }
      this.firstScan = false;
    } catch (e) {this.metrics.errors++; this.metrics.lastError=e.code ?? e.message;}
    const ms = performance.now()-begin;
    this.metrics.scans++; this.metrics.scanMs+=ms; this.metrics.maxScanMs=Math.max(ms,this.metrics.maxScanMs);
  }
}
