import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { type Aggregate, type Command, principals } from '../src/lib/contracts';
import { buildJudgmentAnswer, supportsJudgmentDemo } from '../src/lib/judgment';
import { seed } from '../src/lib/fixtures';
import { transition } from '../src/lib/review';
const [maya,alex,river,agent]=principals;
function cmd(a:Aggregate,operation:Command['operation'],payload:Record<string,unknown>={},actor=maya):Command{return {operation,payload,roundId:a.rounds.at(-1)?.id,expectedVersion:a.version,expectedPrincipalId:actor.id,idempotencyKey:randomUUID()};}
function open(){let a=seed();a=transition(a,maya,cmd(a,'create_round'));a=transition(a,maya,cmd(a,'configure_round',{decisionMakerId:'maya',assignments:[{reviewerId:'alex',role:'Finance',question:'Does the discount include custom terms?',responsibility:'required'}]}));return transition(a,maya,cmd(a,'publish'));}
function answer(a:Aggregate,choice='keep_custom_limit',actor=alex){return transition(a,actor,cmd(a,'judgment_answer',{choice,reason:'Custom terms already have negotiated pricing.',evidenceDigest:a.rounds.at(-1)!.snapshot.digest},actor));}
describe('human judgment to acceptance proposal',()=>{
 it('uses each answer to change the custom-term acceptance example',()=>{const a=open();const keep=answer(a).rounds[0].feedback[0].judgment!;const include=answer(a,'include_custom_terms').rounds[0].feedback[0].judgment!;expect(keep.examples).toEqual([{terms:'standard',expected:20,actual:20},{terms:'custom',expected:15,actual:15}]);expect(include.examples[1]).toEqual({terms:'custom',expected:20,actual:15});});
 it('persists attribution, evidence and history without a sign-off or source mutation',()=>{const a=open(),next=answer(a);expect(next.rounds[0].feedback[0]).toMatchObject({actorId:'alex',kind:'human',snapshotId:a.rounds[0].snapshot.id,disposition:'advice',judgment:{evidenceDigest:a.rounds[0].snapshot.digest}});expect(next.rounds[0].signoffs).toEqual([]);expect(next.rounds[0].decision).toBeUndefined();expect(next.work).toEqual(a.work);expect(next.history.at(-1)?.type).toBe('judgment_answer');});
 it('preserves earlier answers when the human changes their mind',()=>{let a=answer(open());a=answer(a,'include_custom_terms');expect(a.rounds[0].feedback).toHaveLength(2);expect(a.rounds[0].feedback[0].judgment?.choice).toBe('keep_custom_limit');});
 it('rejects agents and other human personas',()=>{for(const actor of [maya,river,agent])expect(()=>answer(open(),'keep_custom_limit',actor)).toThrow('Finance reviewer');});
 it('requires a current required Finance assignment',()=>{let a=open();a=transition(a,maya,cmd(a,'reassign',{assignmentId:a.rounds[0].assignments[0].id,reviewerId:'river',reason:'Ownership changed'}));expect(()=>answer(a)).toThrow('Finance reviewer');});
 it('rejects source changes even before refresh and after refresh',()=>{let a=open();a=transition(a,maya,cmd(a,'simulate_change'));expect(()=>answer(a)).toThrow('basis changed');a=transition(a,maya,cmd(a,'refresh'));expect(()=>answer(a)).toThrow('basis changed');});
 it('rejects a forged evidence digest',()=>{const a=open();expect(()=>transition(a,alex,cmd(a,'judgment_answer',{choice:'keep_custom_limit',reason:'Because policy',evidenceDigest:'wrong'},alex))).toThrow('basis changed');});
 it('rejects incomplete evidence and outages',()=>{const a=open();a.work.evidence[0].complete=false;expect(()=>answer(a)).toThrow('incomplete');a.work.sourceAvailable=false;expect(()=>answer(a)).toThrow('cannot be verified');});
 it('does not apply fictional renewal questions to API-backed work',()=>{const a=open();a.work.id='WO-2';expect(supportsJudgmentDemo(a)).toBe(false);expect(()=>answer(a)).toThrow('fictional renewal');});
 it('rejects closed rounds',()=>{let a=open();a=transition(a,maya,cmd(a,'cancel',{reason:'New basis'}));expect(()=>answer(a)).toThrow('closed');});
 it('validates answer enums and requires a reason',()=>{const a=open();for(const choice of ['guess',null,20])expect(()=>buildJudgmentAnswer(choice,'Because policy',a.snapshot)).toThrow('two business');for(const reason of ['', ' ', 'x'.repeat(2001),null])expect(()=>buildJudgmentAnswer('keep_custom_limit',reason,a.snapshot)).toThrow('Explain');});
});
