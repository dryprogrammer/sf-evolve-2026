import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const run=promisify(execFile);
export class ArtifactEvidence {
 constructor({repository,configFile}){this.repository=repository;this.configFile=configFile;this.cached=null;}
 async snapshot(){
  let config;try{config=JSON.parse(await readFile(this.configFile,'utf8'));}catch(e){if(e.code==='ENOENT')return {enabled:false};throw e;}
  if(!/^[0-9a-f]{7,40}$/.test(config.baseCommit))throw Error('Expected an immutable Git baseline');
  const options={cwd:this.repository,timeout:5000,maxBuffer:1048576};
  const head=(await run('git',['rev-parse','HEAD'],options)).stdout.trim();
  if(this.cached?.head===head&&this.cached.base===config.baseCommit)return this.cached;
  // Fixed read-only Git commands, fixed tracked paths; never follow workspace symlinks
  // or accept a filename, repository, shell command or revision from an HTTP request.
  const paths=['phase1/*.mjs','phase1/*.js','phase1/inspector.html','phase1/test/','.8090/environment.json'];
  const patch=(await run('git',['diff','--no-ext-diff','--no-textconv',config.baseCommit,'HEAD','--',...paths],options)).stdout;
  const files=(await run('git',['diff','--name-only',config.baseCommit,'HEAD','--',...paths],options)).stdout.trim().split('\n').filter(Boolean);
  return this.cached={enabled:true,base:config.baseCommit,head,files,patch,
   versionHash:createHash('sha256').update(patch).digest('hex'),capturedAt:new Date().toISOString(),
   provenance:'Committed Git work products in this inspector workspace; Git alone does not establish agent authorship'};
 }
}
