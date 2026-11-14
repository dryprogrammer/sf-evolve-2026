import { test, expect } from '@playwright/test';
import type { DriftSnapshot } from '../../lib/drift/contracts';

const snapshot: DriftSnapshot = {
 schemaVersion: 1, id: 'ui-test-snapshot', capturedAt: '2026-11-14T21:00:00.000Z', title: 'UI verification fixture',
 coverage: 'Two test sources only; all other coverage unknown.', limitations: ['Test fixture, not project evidence.'],
 sources: [
  { id: 'intent-source', type: 'requirement', title: 'Intent source', url: 'https://example.com/intent', excerpt: 'Require a rationale.', content: 'Require a rationale. Preserve uncertainty.', retrievedAt: '2026-11-14T20:58:00.000Z', revision: null, digest: 'test-digest', completeness: 'complete', access: 'available', note: 'UI test only.' },
  { id: 'delivery-source', type: 'repository', title: 'Delivery source', url: null, excerpt: 'Rationale is optional.', content: 'Rationale is optional.', retrievedAt: '2026-11-14T20:59:00.000Z', revision: 'test-revision', digest: null, completeness: 'excerpt', access: 'available', note: 'Partial test observation.' },
 ],
 reviews: ['intent', 'delivery', 'skeptic'].map((role, index) => ({
  id: `${role}-review`, role: role as 'intent' | 'delivery' | 'skeptic', name: `${role} reviewer`, mode: 'recorded agent review' as const,
  snapshotId: 'ui-test-snapshot', reviewedAt: `2026-11-14T21:0${index + 1}:00.000Z`, summary: 'Recorded test review, not a live agent.', dissent: 'Other implementation paths are possible.',
  findings: [{ id: `${role}-finding`, title: `${role} rationale conflict`, claim: 'Intent requires a rationale but delivery makes it optional.', kind: 'conflict' as const, confidence: 'medium' as const,
   citations: [{ sourceId: 'intent-source', quote: 'Require a rationale.' }, { sourceId: 'delivery-source', quote: 'Rationale is optional.' }], uncertainty: 'Coverage outside these test excerpts is unknown.', correction: 'Require a rationale before selecting a correction.' }],
 })),
};

test.beforeEach(async ({ page }) => {
 await page.route('**/api/drift', route => route.fulfill({ json: snapshot }));
 await page.goto('/drift-room');
 await expect(page.getByRole('heading', { name: 'Shared evidence table' })).toBeVisible();
});

test('shows exact provenance and navigates recorded reviewer stations', async ({ page }) => {
 await expect(page.getByText('RECORDED REVIEW · NOT LIVE', { exact: true })).toBeVisible();
 await expect(page.getByRole('region', { name: 'Snapshot provenance' }).getByText(snapshot.id, { exact: true })).toBeVisible();
 await expect(page.locator('time').filter({ hasText: snapshot.capturedAt })).toBeVisible();
 for (const role of ['delivery', 'skeptic', 'intent']) {
  await page.getByRole('navigation', { name: 'Reviewer stations' }).getByRole('button', { name: new RegExp(`${role}`, 'i') }).click();
  await expect(page.getByRole('region', { name: 'Finding inspector' })).toBeFocused();
  await expect(page.getByRole('heading', { name: `${role} reviewer`, exact: true })).toBeVisible();
 }
 await expect(page.getByText('Literal quote found in collected content')).toHaveCount(2);
});

test('source drilldown exposes full collected content and restores focus', async ({ page }) => {
 const trigger = page.getByRole('region', { name: 'Evidence map' }).getByRole('button', { name: /Intent source/ });
 await trigger.click();
 const dialog = page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 await expect(dialog.getByText('Require a rationale. Preserve uncertainty.', { exact: true })).toBeVisible();
 for (const label of ['Source URL', 'Revision', 'Content digest', 'Retrieved at', 'Access', 'Completeness']) await expect(dialog.getByText(label, { exact: true })).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(dialog).not.toBeVisible();
 await expect(trigger).toBeFocused();
});

test('requires rationale and restores a browser-local selection after reload', async ({ page }) => {
 const save = page.getByRole('button', { name: 'Select proposed correction' });
 await expect(save).toBeDisabled();
 await page.getByLabel('Why select this correction?').fill('Bring delivered behavior back into alignment; verify remaining coverage.');
 await save.click();
 await expect(page.getByText('Correction selected and saved locally. No sources were changed.')).toBeVisible();
 await page.reload();
 await expect(page.getByRole('heading', { name: 'Selected correction', exact: true })).toBeVisible();
 await expect(page.getByText('Bring delivered behavior back into alignment; verify remaining coverage.', { exact: true })).toBeVisible();
 await expect(page.getByText('LOCAL SELECTION · NOT REPAIRED', { exact: true })).toBeVisible();
});

test('reports local storage failure without claiming success', async ({ page }) => {
 await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Test storage unavailable'); }; });
 await page.getByLabel('Why select this correction?').fill('A test rationale.');
 await page.getByRole('button', { name: 'Select proposed correction' }).click();
 await expect(page.getByText(/Decision not saved:/)).toBeVisible();
 await expect(page.getByRole('heading', { name: 'Selected correction', exact: true })).toHaveCount(0);
});

test('displays request failures and can retry without stale findings', async ({ page }) => {
 await page.route('**/api/drift', route => route.fulfill({ status: 503, json: { error: 'Test evidence unavailable' } }));
 await page.reload();
 await expect(page.locator('section[role=alert]')).toContainText('Test evidence unavailable');
 await expect(page.getByRole('heading', { name: 'Shared evidence table' })).toHaveCount(0);
 await page.route('**/api/drift', route => route.fulfill({ json: snapshot }));
 await page.getByRole('button', { name: 'Retry evidence request' }).click();
 await expect(page.getByRole('heading', { name: 'Shared evidence table' })).toBeVisible();
});

test('mobile stations and source dialog stay within the viewport', async ({ page }) => {
 await page.setViewportSize({ width: 375, height: 812 });
 await expect(page.getByRole('navigation', { name: 'Reviewer stations' })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.getByRole('region', { name: 'Evidence map' }).getByRole('button', { name: /Intent source/ }).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
 await page.getByRole('button', { name: 'Close source drilldown' }).click();
});


test('keyboard navigation reaches a station and source dialog wraps focus', async ({ page }) => {
 const station = page.getByRole('navigation', { name: 'Reviewer stations' }).getByRole('button', { name: /Skeptic/ });
 await station.focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('region', { name: 'Finding inspector' })).toBeFocused();
 await expect(page.getByRole('heading', { name: 'skeptic reviewer', exact: true })).toBeVisible();
 await page.getByRole('region', { name: 'Evidence map' }).getByRole('button', { name: /Intent source/ }).click();
 await expect(page.getByRole('button', { name: 'Close source drilldown' })).toBeFocused();
 await page.keyboard.press('Shift+Tab');
 await expect(page.getByRole('dialog').locator('pre')).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(page.getByRole('button', { name: 'Close source drilldown' })).toBeFocused();
});

test('unavailable sources are not represented as verified quotes or full content', async ({ page }) => {
 const partial = structuredClone(snapshot);
 partial.sources[0].access = 'unavailable';
 partial.sources[0].completeness = 'unknown';
 partial.sources[0].note = 'Source access could not be established.';
 await page.route('**/api/drift', route => route.fulfill({ json: partial }));
 await page.reload();
 await expect(page.getByText('Quote not verifiable against available collected content')).toHaveCount(1);
 await page.getByRole('region', { name: 'Evidence map' }).getByRole('button', { name: /Intent source/ }).click();
 await expect(page.getByRole('dialog').getByText('Source unavailable. Full content cannot be inspected.')).toBeVisible();
 await expect(page.getByRole('dialog').getByText('Source access could not be established.')).toBeVisible();
});
