import { describe, it, expect } from 'vitest';
import { seed } from '../src/lib/fixtures';
import { principals, type FactoryView, type Round } from '../src/lib/contracts';
import { obligation } from '../src/lib/attention';
function view(): FactoryView { return { ...seed(), principal:principals[0], principals, draft:null, sourceMode:'fixture' }; }
function round(v:FactoryView): Round { const r:Round={id:'round',state:'open',snapshot:structuredClone(v.snapshot),decisionMakerId:'maya',assignments:[{id:'a',reviewerId:'alex',role:'Finance',question:'Are custom terms excluded?',responsibility:'required',generation:1}],feedback:[],signoffs:[]};v.rounds.push(r);return r; }
describe('human attention projection',()=>{
 it('shows explicit setup when review has not been requested',()=>{expect(obligation(view())).toMatchObject({title:'Request accountable review',state:'needed'});});
 it('shows the responsible person, question and exact sign-off action',()=>{const v=view();round(v);expect(obligation(v)).toMatchObject({title:'Required response: Finance',why:'Are custom terms excluded?',owner:'Alex · Finance',action:expect.stringContaining('submit sign-off')});});
 it('never treats advisory support as required sign-off',()=>{const v=view(),r=round(v);r.feedback.push({id:'f',actorId:'observer',kind:'agent',disposition:'support',text:'yes',createdAt:'now',snapshotId:r.snapshot.id});expect(obligation(v).title).toBe('Required response: Finance');});
 it('prioritizes stale review over old sign-offs and retains the original snapshot',()=>{const v=view(),r=round(v);v.work.sourceVersion++;expect(obligation(v)).toMatchObject({title:'Review evidence is stale',action:expect.stringContaining('fresh sign-offs')});expect(r.snapshot.sourceVersion).toBe(1);});
 it('shows decision only after current required response and retains human concerns',()=>{const v=view(),r=round(v);r.signoffs.push({id:'s',assignmentId:'a',generation:1,actorId:'alex',outcome:'approve',rationale:'verified',createdAt:'now',snapshotId:r.snapshot.id});expect(obligation(v).title).toBe('Decision needs you');r.feedback.push({id:'f',actorId:'alex',kind:'human',disposition:'request_changes',text:'respond',createdAt:'now',snapshotId:r.snapshot.id});expect(obligation(v).title).toBe('Human concerns need an explicit response');});
 it('does not equate historical approval with current evidence or release',()=>{const v=view(),r=round(v);r.state='approved';expect(obligation(v).state).toBe('resolved');v.work.sourceVersion++;expect(obligation(v).state).toBe('needed');expect(obligation(v).why).toContain('not release');});
 it('does not leak denied review details or claim outage is approval',()=>{const v=view();round(v);v.work.evidence[0].permitted=false;expect(obligation(v)).toMatchObject({state:'unknown',title:'Evidence access needs restoration'});v.work.evidence[0].permitted=true;v.work.sourceAvailable=false;expect(obligation(v).state).toBe('unknown');});
});
