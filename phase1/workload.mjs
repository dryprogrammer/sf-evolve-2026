// Real bounded verification workload, invoked by an active agent. Not simulated agent states.
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
for(let sequence=0;sequence<Number(process.env.SAMPLE_COUNT??40);sequence++){
 for(const file of await readdir(new URL('.',import.meta.url)))if(file.endsWith('.mjs'))
   createHash('sha256').update(await readFile(new URL(file,import.meta.url))).digest('hex');
 if(sequence===0||sequence===20)execFileSync(process.execPath,['--test','phase1/test/capture.test.mjs']);
 console.log(JSON.stringify({producerAt:new Date().toISOString(),probe:'parent-verification',sequence,
  action:'hash implementation files; test suite at 0 and 20'}));await sleep(500);
}
