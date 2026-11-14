import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const paths=execFileSync('git',['ls-files','src','tests','migrations','package.json','package-lock.json','playwright.config.ts','tsconfig.json','vitest.config.ts'],{encoding:'utf8'}).trim().split('\n');
const sourceHashes=Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
const checks=[];
mkdirSync('docs/evidence',{recursive:true});mkdirSync('public/evidence',{recursive:true});
for(const script of ['typecheck','test','build','test:e2e']){
 const startedAt=new Date().toISOString();
 const result=spawnSync('npm',['run',script],{encoding:'utf8',env:process.env,timeout:180000,maxBuffer:8*1024*1024});
 const log=`docs/evidence/${script.replace(':','-')}.log`;
 writeFileSync(log,`Verified revision: ${revision}\nStarted: ${startedAt}\nCommand: npm run ${script}\n\n${result.stdout??''}${result.stderr??''}\nExit: ${result.status}\n`);
 const check={command:`npm run ${script}`,startedAt,finishedAt:new Date().toISOString(),exitCode:result.status,log};
 checks.push(check);console.log(check.command,check.exitCode);
 if(result.status!==0){console.error(result.stdout,result.stderr);break;}
}
const record={status:checks.length===4&&checks.every(c=>c.exitCode===0)?'passed':'failed',verifiedRevision:revision,capturedAt:new Date().toISOString(),browserExecutable:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'Playwright default',sourceHashes,checks,limitations:['Captured local verification, not deployment, public submission or independent human approval.','Source hashes identify tested files; later edits require verification again.','Fictional seeded business inputs and selectable fixture personas; source mutation is simulated.','The recorded review checks a snapshot; it does not implement or release billing changes.']};
writeFileSync('public/evidence/verification.json',JSON.stringify(record,null,2)+'\n');
if(record.status!=='passed')process.exitCode=1;
