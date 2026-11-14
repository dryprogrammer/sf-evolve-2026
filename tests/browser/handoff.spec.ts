import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import type { FactoryView } from '../../src/lib/contracts';

async function state(page: Page): Promise<FactoryView> {
  const response = await page.request.get('/api/factory');
  expect(response.ok()).toBe(true);
  return response.json();
}
async function action(page: Page, name: string, operation: string, code?: string) {
  const pending = page.waitForResponse(r => r.url().endsWith('/api/factory') && r.request().method() === 'POST' && r.request().postDataJSON().operation === operation);
  await page.getByRole('button', { name, exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(code ? 409 : 200);
  if (code) {
    expect((await response.json()).error.code).toBe(code);
    await expect(page.getByRole('alert').filter({ hasText: code })).toBeVisible();
    // Visible means on screen, not merely present above the scrolled review form.
    await expect(page.getByRole('alert').filter({ hasText: code })).toBeInViewport();
  } else await expect(page.getByRole('button', { name, exact: true })).not.toBeDisabled();
}
async function cancel(page: Page) {
  await page.getByText('Cancel this round', { exact: true }).click();
  await page.getByLabel('Cancellation reason').fill('Superseded by a fresh evidence review.');
  page.once('dialog', dialog => dialog.accept());
  const pending = page.waitForResponse(r => r.request().method() === 'POST' && r.request().postDataJSON()?.operation === 'cancel');
  await page.getByRole('button', { name: 'Cancel round…', exact: true }).click();
  expect((await pending).status()).toBe(200);
  await expect(page.getByLabel('Cancellation reason')).toHaveCount(0);
}
async function newRound(page: Page) {
  await action(page, 'New round', 'create_round');
  await page.getByLabel('Human decision maker').selectOption('maya');
  await page.getByRole('button', { name: 'Add human reviewer' }).click();
  await page.getByLabel('Human reviewer', { exact: true }).selectOption('alex');
  await page.getByLabel('Review role', { exact: true }).fill('Security');
  await page.getByLabel('Question to answer').fill('Is the current evidence ready?');
  await page.getByLabel('Responsibility', { exact: true }).selectOption('required');
  await action(page, 'Save round setup', 'configure_round');
  await page.getByRole('button', { name: 'Publish saved round' }).click();
  await expect(page.getByText('Required sign-off pending', { exact: true })).toBeVisible();
  return (await state(page)).rounds.at(-1)!;
}
async function sign(page: Page, rationale: string) {
  await page.getByLabel('Fixture persona').selectOption('alex');
  await page.getByLabel('Sign-off rationale').fill(rationale);
  await page.getByRole('button', { name: 'Submit sign-off', exact: true }).click();
  await expect(page.getByText('Sign-off: approve', { exact: true })).toBeVisible();
  await page.getByLabel('Fixture persona').selectOption('maya');
  await expect(page.getByLabel('Decision rationale')).toBeVisible();
}

test('changed evidence rejects a signed old round after refresh; a newly reviewed round persists approval', async ({ page }) => {
  test.setTimeout(90000);
  // Use this browser context's cookie, preserve all earlier rounds, and never reset the shared store.
  const session = await page.request.post('/api/session', { data: { principalId: 'maya' }, headers: { Origin: 'http://localhost:3100' } });
  expect(session.ok()).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Work inspector', exact: true }).click();
  await expect(page.getByLabel('Fixture persona')).toHaveValue('maya');
  for (const round of (await state(page)).rounds.filter(r => r.state === 'open')) {
    await page.getByLabel('Current & prior rounds').selectOption(round.id);
    await cancel(page);
  }
  await action(page, 'Refresh saved context', 'refresh');
  const old = await newRound(page);
  await sign(page, `Original evidence ${randomUUID()}`);
  const signedOld = (await state(page)).rounds.find(r => r.id === old.id)!;
  await action(page, 'Simulate source change', 'simulate_change');
  await page.getByLabel('Decision rationale').fill('Approve only verified evidence.');
  const before = await state(page);
  await action(page, 'Submit human decision', 'decide', 'changed_evidence');
  expect(await state(page)).toEqual(before);
  await expect(page.getByLabel('Decision rationale')).toHaveValue('Approve only verified evidence.');
  await action(page, 'Refresh saved context', 'refresh');
  const refreshed = await state(page);
  expect(refreshed.snapshot.digest).not.toBe(old.snapshot.digest);
  expect(refreshed.rounds.find(r => r.id === old.id)).toEqual(signedOld);
  await action(page, 'Submit human decision', 'decide', 'changed_evidence');
  expect(await state(page)).toEqual(refreshed);
  await cancel(page);
  const current = await newRound(page);
  expect(current.signoffs).toEqual([]);
  await page.getByLabel('Decision rationale').fill('A fresh review is required.');
  await action(page, 'Submit human decision', 'decide', 'pending_signoffs');
  const rationale = `Current evidence re-reviewed ${randomUUID()}`;
  await sign(page, rationale);
  await page.getByLabel('Decision rationale').fill('Approve the freshly reviewed evidence.');
  await page.getByRole('button', { name: 'Submit human decision', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Human decision · approve', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Work inspector', exact: true }).click();
  const persisted = await state(page);
  const approved = persisted.rounds.find(r => r.id === current.id)!;
  expect(approved.state).toBe('approved');
  expect(approved.decision).toMatchObject({ actorId: 'maya', outcome: 'approve', digest: persisted.snapshot.digest, verifiedAt: expect.any(String) });
  expect(approved.signoffs).toEqual([expect.objectContaining({ actorId: 'alex', outcome: 'approve', snapshotId: current.snapshot.id, rationale })]);
  expect(persisted.rounds.find(r => r.id === old.id)).toEqual({ ...signedOld, state: 'cancelled' });
  expect(persisted.history.filter(h => h.type === 'decide' && [old.id, current.id].includes(h.roundId!))).toEqual([expect.objectContaining({ actorId: 'maya', roundId: current.id, snapshotId: current.snapshot.id })]);
  await expect(page.getByRole('alert').filter({ hasText: 'changed_evidence' })).toHaveCount(0);
  await expect(page.getByText(rationale, { exact: true })).toBeVisible();
  await page.getByLabel('Current & prior rounds').selectOption(old.id);
  await expect(page.getByRole('heading', { name: 'Human decision · approve', exact: true })).toHaveCount(0);
  await expect(page.getByText(signedOld.signoffs[0].rationale, { exact: true })).toBeVisible();
  await expect(page.getByText('Closed round — preserved for reference. Start a new round to review again.', { exact: true })).toBeVisible();
});
