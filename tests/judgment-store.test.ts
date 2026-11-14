import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type Command, type FactoryView, principals } from '../src/lib/contracts';
import { FactoryStore } from '../src/lib/store';
const [maya, alex]=principals;
const cmd=(v:FactoryView,operation:Command['operation'],payload:Record<string,unknown>={},roundId?:string):Command=>({operation,payload,roundId,expectedVersion:v.version,expectedPrincipalId:v.principal.id,idempotencyKey:randomUUID()});
it('stores judgment and proposal transactionally, reconciles retry and restores exact attribution after restart',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'judgment-'));let s=new FactoryStore(dir);
 try {
  let v=await s.get(maya);v=await s.execute(maya,cmd(v,'create_round'));const r=v.rounds.at(-1)!.id;
  v=await s.execute(maya,cmd(v,'configure_round',{decisionMakerId:'maya',assignments:[{reviewerId:'alex',role:'Finance',question:'Custom terms?',responsibility:'required'}]},r));
  v=await s.execute(maya,cmd(v,'publish',{},r));v=await s.get(alex);
  const answer=cmd(v,'judgment_answer',{choice:'include_custom_terms',reason:'A business exception worth implementing.',evidenceDigest:v.rounds.at(-1)!.snapshot.digest},r);
  v=await s.execute(alex,answer);const saved=v.rounds.at(-1)!.feedback.at(-1)!;
  expect((await s.execute(alex,answer)).rounds.at(-1)!.feedback).toHaveLength(1);
  await s.close();s=new FactoryStore(dir);v=await s.get(alex);
  expect(v.rounds.at(-1)!.feedback.at(-1)).toEqual(saved);expect(saved.judgment?.examples[1]).toEqual({terms:'custom',expected:20,actual:15});
  let m=await s.get(maya);m=await s.execute(maya,cmd(m,'simulate_revoke',{permitted:false}));
  expect((await s.get(alex)).rounds).toEqual([]);
 } finally {await s.close();await rm(dir,{recursive:true,force:true});}
});
