import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import type { Command, FactoryView } from '../../src/lib/contracts';
async function state(page:Page):Promise<FactoryView>{return (await page.request.get('/api/factory')).json();}
async function command(page:Page,operation:Command['operation'],payload:Record<string,unknown>={},roundId?:string){const a=await state(page);const res=await page.request.post('/api/factory',{headers:{Origin:'http://localhost:3100'},data:{operation,payload,roundId,expectedPrincipalId:a.principal.id,expectedVersion:a.version,idempotencyKey:randomUUID()}});expect(res.status()).toBe(200);return res.json() as Promise<FactoryView>;}
test('Finance answer changes acceptance examples, survives reload and becomes stale with source change',async({page})=>{
 await page.request.post('/api/session',{headers:{Origin:'http://localhost:3100'},data:{principalId:'maya'}});
 // Respect existing fixture history; cancel any open round rather than reset the database.
 const initial=await state(page);
 for(const r of initial.rounds.filter(r=>r.state==='open'))await command(page,'cancel',{reason:'New judgment demo'},r.id);
 await command(page,'simulate_outage',{available:true});await command(page,'simulate_revoke',{permitted:true});await command(page,'refresh');
 let a=await command(page,'create_round');const r=a.rounds.at(-1)!.id;
 await command(page,'configure_round',{decisionMakerId:'maya',assignments:[{reviewerId:'alex',role:'Finance',question:'Does 20% include custom terms?',responsibility:'required'}]},r);
 await command(page,'publish',{},r);
 await page.request.post('/api/session',{headers:{Origin:'http://localhost:3100'},data:{principalId:'alex'}});
 await page.goto('/');await page.getByRole('button',{name:'Work inspector',exact:true}).click();
 const panel=page.getByRole('region',{name:'Business judgment handoff'});
 await expect(panel).toContainText('no agent/MCP invocation');
 await panel.getByLabel('Include custom terms at 20%',{exact:false}).check();
 await panel.getByLabel('Business reason').fill('Give negotiated customers the same discount.');
 await panel.getByRole('button',{name:'Record answer & build acceptance examples'}).click();
 await expect(panel).toContainText('custom terms: expected 20%, prepared code returns 15%');
 await expect(panel).toContainText('implementation change needed');
 a=await state(page);expect(a.rounds.at(-1)!.feedback.at(-1)!.actorId).toBe('alex');expect(a.rounds.at(-1)!.signoffs).toHaveLength(0);
 await page.reload();await page.getByRole('button',{name:'Work inspector',exact:true}).click();
 await expect(panel).toContainText('Give negotiated customers the same discount.');
 await panel.getByLabel('Keep custom terms at 15%',{exact:false}).check();
 await panel.getByLabel('Business reason').fill('Keep the negotiated pricing limit.');
 await panel.getByRole('button',{name:'Record answer & build acceptance examples'}).click();
 await expect(panel.getByRole('heading',{name:'Engineering acceptance proposal'})).toHaveCount(2);
 await page.request.post('/api/session',{headers:{Origin:'http://localhost:3100'},data:{principalId:'maya'}});
 await command(page,'simulate_change');await command(page,'refresh');
 await page.reload();await page.getByRole('button',{name:'Work inspector',exact:true}).click();
 await expect(panel).toContainText('answers need reconfirmation');
 await expect(panel.getByRole('heading',{name:'Engineering acceptance proposal'})).toHaveCount(2);
 // Leave no new open round for subsequent existing browser tests.
 await command(page,'cancel',{reason:'Judgment browser verification finished'},r);
});
