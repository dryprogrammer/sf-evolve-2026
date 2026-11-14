import { test, expect, type Page } from '@playwright/test';
const scene=(page:Page)=>page.getByRole('application',{name:'Walkable 2D sprite factory'});
async function position(page:Page){return scene(page).evaluate(c=>({x:c.getAttribute('data-player-x'),y:c.getAttribute('data-player-y')}));}
async function ready(page:Page){await page.goto('/');await expect(page.getByLabel('Walking as')).toBeEnabled();await expect(scene(page)).toHaveAttribute('data-player-x',/\d/);}
test('default sprite floor reaches all five stations and opens a contextual inspector',async({page})=>{
 test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
 await expect(page.getByRole('heading',{name:'Good work starts on the floor.'})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 for(const [name,id,x,y] of [['Assembly','assembly','496.0','336.0'],['Security','security','944.0','336.0'],['Maintainability','maintainability','208.0','528.0'],['Growth','growth','784.0','528.0'],['Economics','economics','1008.0','528.0']]){
  await page.getByRole('button',{name:`Walk to ${name}`,exact:true}).click();await expect(scene(page)).toHaveAttribute('data-player-x',x,{timeout:12000});await expect(scene(page)).toHaveAttribute('data-player-y',y);await expect(scene(page)).toHaveAttribute('data-nearby',id);
  await page.keyboard.press('e');await expect(page.getByRole('dialog',{name:`${name} work inspector`})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(scene(page)).toBeFocused();
 }
 expect(errors).toEqual([]);
});
test('keyboard and click movement preserve unsent text and position across focus-contained inspector visits',async({page})=>{
 await ready(page);await scene(page).focus();const start=await position(page);await page.keyboard.down('d');await expect.poll(async()=>(await position(page)).x).not.toBe(start.x);await page.keyboard.up('d');
 // Click an open tile using the canvas's true rendered dimensions.
 const box=(await scene(page).boundingBox())!;await page.mouse.click(box.x+592/1152*box.width,box.y+592/704*box.height);await expect(scene(page)).toHaveAttribute('data-player-x','592.0');await expect(scene(page)).toHaveAttribute('data-player-y','592.0');
 const before=await position(page);await page.getByRole('button',{name:'Work inspector',exact:true}).click();await page.getByLabel('Your working notes').fill('Unsent spatial notes: wasd');await page.keyboard.type('wasd');
 for(let i=0;i<20;i++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement?.closest('dialog')!==null)).toBe(true);}
 await page.getByRole('button',{name:'Close work inspector'}).focus();await page.keyboard.press('Shift+Tab');expect(await page.evaluate(()=>document.activeElement?.closest('dialog')!==null)).toBe(true);expect(await position(page)).toEqual(before);await page.keyboard.press('Escape');await page.getByRole('button',{name:'Work inspector',exact:true}).click();await expect(page.getByLabel('Your working notes')).toHaveValue('Unsent spatial notes: wasdwasd');expect(await position(page)).toEqual(before);
});
test('reduced motion preserves deliberate navigation and mobile touch controls fit the page',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await ready(page);await expect(scene(page)).toHaveAttribute('data-reduced-motion','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Walk right',exact:true}).click();await expect(scene(page)).toHaveAttribute('data-player-x','624.0');await page.getByRole('button',{name:'Walk to Growth',exact:true}).click();await expect(scene(page)).toHaveAttribute('data-player-x','784.0',{timeout:10000});await expect(scene(page)).toHaveAttribute('data-player-y','528.0');await page.getByRole('button',{name:'Inspect nearby',exact:true}).click();await expect(page.getByRole('dialog',{name:'Growth work inspector'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('permission loss clears protected floor summaries and persona switching updates the shared projection',async({page})=>{
 await ready(page);await page.getByLabel('Walking as').selectOption('alex');await expect(page.getByLabel('Walking as')).toHaveValue('alex');await page.getByRole('button',{name:'Work inspector',exact:true}).click();await expect(page.getByLabel('Fixture persona')).toHaveValue('alex');await page.getByLabel('Fixture persona').selectOption('maya');await expect(page.getByLabel('Fixture persona')).toHaveValue('maya');await page.getByRole('button',{name:'Revoke evidence access'}).click();await expect(page.getByText('Restricted evidence',{exact:true})).toHaveCount(2);await page.keyboard.press('Escape');
 await expect(page.getByRole('region',{name:'Persisted fixture work'})).toContainText('Access not verified');await expect(page.getByRole('region',{name:'Persisted fixture work'})).not.toContainText('Introduce a human review checkpoint');
 await page.getByRole('button',{name:'Work inspector',exact:true}).click();await page.getByRole('button',{name:'Restore evidence access'}).click();await expect(page.getByRole('button',{name:'Revoke evidence access'})).toBeVisible();await page.keyboard.press('Escape');await page.getByLabel('Walking as').selectOption('alex');await expect(page.getByLabel('Walking as')).toHaveValue('alex');
});
