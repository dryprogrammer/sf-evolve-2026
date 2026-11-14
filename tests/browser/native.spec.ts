import { test, expect, type Page } from '@playwright/test';
import type { FactoryView } from '../../src/lib/contracts';

// Use the running backend, including persisted fixture fallback. No mocked records
// or Factory credentials: native context must match the server's projection.
async function ready(page: Page) {
  const response = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/factory' && response.request().method() === 'GET');
  await page.goto('/');
  const backend = await response;
  expect(backend.ok()).toBe(true);
  const view = await backend.json() as FactoryView;
  await expect(page.getByLabel('Walking as')).toBeEnabled();
  return view;
}
const native = (page: Page) => page.locator('main#work-orders');
const record = (page: Page, id: string) => page.getByRole('button', { name: `Open ${id} shared context`, exact: true });
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('native Work Orders is the default and renders only the backend shared record', async ({ page }) => {
  const view = await ready(page);
  expect(view.work.evidence.every(evidence => evidence.permitted)).toBe(true);
  await expect(native(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Work Orders 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Work Orders/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('application', { name: 'Walkable 2D sprite factory' })).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const list = page.getByRole('region', { name: 'Work orders', exact: true });
  await expect(list.getByRole('button')).toHaveCount(1);
  await expect(record(page, view.work.id)).toContainText(view.work.id);
  await expect(record(page, view.work.id)).toContainText(view.work.title);
  await expect(record(page, view.work.id)).toContainText(view.work.status);
  await expect(native(page).getByRole('heading', { name: view.work.title, exact: true })).toBeVisible();
  await expect(native(page).locator('.native-context').first()).toContainText(view.work.description);
  await expect(native(page).locator('.native-source')).toHaveCount(view.work.evidence.length);
  for (const evidence of view.work.evidence) {
    await expect(native(page).getByRole('button', { name: `${evidence.title} v${evidence.version} · ${evidence.complete ? 'Complete' : 'Incomplete'} ↗`, exact: true })).toBeVisible();
  }
  await expect(page.getByText('No live agent stream or queued instructions.', { exact: false })).toBeVisible();
});

test('native record opens the working inspector with modal focus, Escape and focus return', async ({ page }) => {
  const view = await ready(page);
  const trigger = record(page, view.work.id);
  await trigger.click();
  const inspector = page.getByRole('dialog', { name: `${view.work.id} work inspector`, exact: true });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole('heading', { name: 'Work inspector', exact: true })).toBeVisible();
  await expect(inspector.getByLabel('Your working notes')).toBeEnabled();
  await expect(inspector.getByRole('button', { name: 'Save private draft', exact: true })).toBeEnabled();
  await expect(inspector).toContainText(view.work.id);
  await expect(inspector).toContainText(view.work.title);
  expect(await inspector.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  const close = inspector.getByRole('button', { name: 'Close work inspector' });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await inspector.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    expect(await inspector.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(inspector).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(inspector).toBeVisible();
  await close.click();
  await expect(trigger).toBeFocused();
});

test('native context and its inspector fit a 320px viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const view = await ready(page);
  await expect(record(page, view.work.id)).toBeVisible();
  await noOverflow(page);
  await record(page, view.work.id).click();
  const inspector = page.getByRole('dialog', { name: `${view.work.id} work inspector`, exact: true });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByLabel('Your working notes')).toBeVisible();
  await noOverflow(page);
  expect(await inspector.evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  const box = (await inspector.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');
  await expect(record(page, view.work.id)).toBeFocused();
  await noOverflow(page);
});

test('unavailable agent activity and unsupported project modules are disabled, not fake tools', async ({ page }) => {
  await ready(page);
  await expect(page.getByRole('button', { name: 'Agent activity unavailable', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agent activity unavailable', exact: true })).toBeDisabled();
  await expect(native(page)).toContainText('No live events or next-turn queue.');
  for (const module of ['Requirements', 'Blueprints', 'Knowledge Base', 'Tests', 'Feedback', 'Automations']) {
    await expect(page.getByRole('button', { name: `${module} unavailable`, exact: true })).toBeDisabled();
  }
  await expect(page.getByRole('button', { name: 'Factory floor', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
