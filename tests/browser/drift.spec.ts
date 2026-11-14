import { test, expect, type Page } from '@playwright/test';
import type { DriftDecision, DriftSnapshot, ReviewerRole } from '../../src/lib/drift/contracts';

// Explicit synthetic UI fixture. None of these statements are project findings.
function fixture(): DriftSnapshot {
 const id = 'synthetic-browser-drift';
 return {
  schemaVersion: 1, id, capturedAt: '2026-11-14T21:00:00.000Z', title: 'Synthetic browser snapshot',
  coverage: 'Two synthetic documents only; all other coverage unknown.',
  limitations: ['Synthetic test data, not Factory evidence.'],
  sources: [
   { id: 'intent-source', type: 'requirement', title: 'Synthetic intent source', url: null,
    excerpt: 'A rationale is required.', content: 'A rationale is required. Retain uncertainty.',
    retrievedAt: '2026-11-14T20:58:00.000Z', revision: null, digest: 'synthetic-local-fingerprint',
    completeness: 'complete', access: 'available', note: 'Synthetic document only.' },
   { id: 'delivery-source', type: 'repository', title: 'Synthetic delivery source', url: null,
    excerpt: 'A rationale is optional.', content: 'A rationale is optional. Bounded synthetic observation.',
    retrievedAt: '2026-11-14T20:59:00.000Z', revision: 'synthetic-exposed-revision', digest: null,
    completeness: 'excerpt', access: 'available', note: 'Synthetic partial document only.' },
  ],
  reviews: (['intent', 'delivery', 'skeptic'] as const).map(role => ({
   id: `${role}-review`, role, name: `Synthetic ${role} reviewer`, mode: 'recorded agent review',
   snapshotId: id, reviewedAt: '2026-11-14T21:01:00.000Z',
   summary: 'Recorded synthetic comparison.', dissent: 'Other approaches remain possible.',
   findings: [{ id: `${role}-finding`, title: `Synthetic ${role} discrepancy`,
    claim: 'The synthetic documents disagree on rationale requirements.', kind: 'conflict', confidence: 'medium',
    citations: [{ sourceId: 'intent-source', quote: 'A rationale is required.' },
     { sourceId: 'delivery-source', quote: 'A rationale is optional.' }],
    uncertainty: 'No claim beyond the synthetic documents.', correction: 'Require a rationale.' }],
  })),
 };
}
const inspector = (page: Page) => page.getByRole('region', { name: 'Finding inspector', exact: true });
const stationLabels: Record<ReviewerRole, string> = { intent: 'Intent reviewer', delivery: 'Delivery reviewer', skeptic: 'Skeptic' };
const station = (page: Page, role: ReviewerRole) => page.getByRole('navigation', { name: 'Reviewer stations', exact: true })
 .getByRole('button', { name: stationLabels[role], exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'Select proposed correction', exact: false });
const rationale = (page: Page) => page.getByLabel('Why select this correction?', { exact: true });
async function mockSnapshot(page: Page, snapshot: DriftSnapshot) {
 await page.route('**/api/drift', async route => {
  expect(route.request().method()).toBe('GET');
  await route.fulfill({ json: snapshot });
 });
 await page.goto('/drift-room');
 await expect(page.getByRole('region', { name: 'Snapshot provenance', exact: true })).toContainText(snapshot.id);
}
async function localDecision(page: Page, id: string): Promise<DriftDecision | null> {
 return page.evaluate(snapshotId => {
  const raw = window.localStorage.getItem(`drift-room:decision:${snapshotId}`);
  return raw ? JSON.parse(raw) : null;
 }, id);
}

test.describe('Drift Room — MOCKED GET snapshot, actual browser/localStorage', () => {
 test('shows preserved provenance and navigates all recorded reviewer stations by keyboard', async ({ page }) => {
  const snapshot = fixture(); await mockSnapshot(page, snapshot);
  await expect(page.getByText('RECORDED REVIEW · NOT LIVE', { exact: true })).toBeVisible();
  await expect(page.getByText('No live agents in this room.', { exact: true })).toBeVisible();
  const provenance = page.getByRole('region', { name: 'Snapshot provenance', exact: true });
  await expect(provenance).toContainText(snapshot.capturedAt);
  await expect(provenance).toContainText(snapshot.coverage);
  for (const review of snapshot.reviews) {
   const button = station(page, review.role);
   await button.focus(); await page.keyboard.press('Enter');
   await expect(button).toHaveAttribute('aria-pressed', 'true');
   await expect(inspector(page)).toBeFocused();
   await expect(inspector(page).getByRole('heading', { name: review.name, exact: true })).toBeVisible();
   await expect(inspector(page)).toContainText(review.findings[0].uncertainty);
   await expect(inspector(page)).toContainText(review.dissent);
   await expect(inspector(page).getByText('Literal quote found in collected content', { exact: true })).toHaveCount(2);
  }
 });
 test('replay is explicitly labeled recorded and cannot launch live agents or write APIs', async ({ page }) => {
  const apiRequests: { path: string; method: string }[] = [];
  page.on('request', request => {
   const path = new URL(request.url()).pathname;
   if (path.startsWith('/api/')) apiRequests.push({ path, method: request.method() });
  });
  await mockSnapshot(page, fixture());
  const replay = page.getByRole('button', { name: /Replay/i });
  await expect(replay).toBeEnabled();
  await expect(replay).toHaveAccessibleName(/recorded/i);
  await replay.click();
  await expect(page.getByText('RECORDED REVIEW · NOT LIVE', { exact: true })).toBeVisible();
  await expect(page.getByText('No live agents in this room.', { exact: true })).toBeVisible();
  expect(apiRequests).toEqual([{ path: '/api/drift', method: 'GET' }]);
 });
 test('source drilldown preserves collected content and distinguishes digest from revision', async ({ page }) => {
  const snapshot = fixture(); await mockSnapshot(page, snapshot);
  const map = page.getByRole('region', { name: 'Evidence map', exact: true });
  for (const source of snapshot.sources) {
   const trigger = map.getByRole('button', { name: new RegExp(source.title) });
   await trigger.click();
   const dialog = page.getByRole('dialog', { name: source.title, exact: true });
   await expect(dialog).toBeVisible();
   await expect(dialog.locator('pre')).toHaveText(source.content);
   await expect(dialog.getByText(source.id, { exact: true })).toBeVisible();
   await expect(dialog.getByText(source.retrievedAt, { exact: true })).toBeVisible();
   await expect(dialog.getByText(source.revision ?? 'Unknown / not exposed', { exact: true })).toBeVisible();
   await expect(dialog).toContainText('Local fingerprint, not an authoritative revision.');
   await expect(dialog).toContainText(source.completeness);
   if (source.digest) await expect(dialog).toContainText(source.digest);
   await page.keyboard.press('Escape');
   await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
  }
 });
 test('requires rationale, stores the complete snapshot, restores it, and makes no API writes', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => {
   if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET') writes.push(request.url());
  });
  const snapshot = fixture(); await mockSnapshot(page, snapshot);
  await expect(save(page)).toBeDisabled();
  await rationale(page).fill('   '); await expect(save(page)).toBeDisabled();
  const reason = 'Preserve the requirement; independently verify remaining scope.';
  await rationale(page).fill(reason); await save(page).click();
  await expect(page.getByText('Correction selected and saved locally. No sources were changed.', { exact: true })).toBeVisible();
  const decision = await localDecision(page, snapshot.id);
  expect(decision).toMatchObject({ schemaVersion: 1, snapshotId: snapshot.id,
   reviewerId: snapshot.reviews[0].id, findingId: snapshot.reviews[0].findings[0].id,
   correction: snapshot.reviews[0].findings[0].correction, rationale: reason, snapshot });
  expect(Number.isNaN(Date.parse(decision!.selectedAt))).toBe(false);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Selected correction', exact: true })).toBeVisible();
  await expect(page.getByText(reason, { exact: true })).toBeVisible();
  await expect(page.getByText('LOCAL SELECTION · NOT REPAIRED', { exact: true })).toBeVisible();
  expect(await localDecision(page, snapshot.id)).toEqual(decision);
  expect(writes).toEqual([]);
 });
 test('replaces one local selection and does not restore it for a different snapshot', async ({ page }) => {
  const snapshot = fixture(); await mockSnapshot(page, snapshot);
  await rationale(page).fill('First local rationale.'); await save(page).click();
  await station(page, 'delivery').click();
  await expect(rationale(page)).toHaveValue('');
  await rationale(page).fill('Delivery selection instead.'); await save(page).click();
  await expect.poll(async () => (await localDecision(page, snapshot.id))?.reviewerId).toBe('delivery-review');
  const next = fixture(); next.id = 'different-browser-snapshot';
  next.reviews.forEach(review => { review.snapshotId = next.id; });
  await page.route('**/api/drift', route => route.fulfill({ json: next }));
  await page.reload();
  await expect(page.getByRole('region', { name: 'Snapshot provenance' })).toContainText(next.id);
  await expect(page.getByRole('heading', { name: 'Selected correction', exact: true })).toHaveCount(0);
  expect(await localDecision(page, next.id)).toBeNull();
  expect((await localDecision(page, snapshot.id))?.rationale).toBe('Delivery selection instead.');
 });
 test('reports storage write failure without claiming a selected correction', async ({ page }) => {
  const snapshot = fixture(); await mockSnapshot(page, snapshot);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Synthetic storage write failure'); }; });
  await rationale(page).fill('Test storage failure.'); await save(page).click();
  await expect(page.getByText(/Decision not saved:.*Synthetic storage write failure/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Selected correction', exact: true })).toHaveCount(0);
  expect(await localDecision(page, snapshot.id)).toBeNull();
 });
 test('reports storage read failure while retaining the recorded evidence', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('Synthetic storage read failure'); }; });
  await mockSnapshot(page, fixture());
  await expect(page.getByText(/Local decision could not be restored:.*Synthetic storage read failure/)).toBeVisible();
  await expect(inspector(page).getByRole('heading', { name: 'Synthetic intent discrepancy', exact: true })).toBeVisible();
 });
 test('missing evidence is coverage unknown, not an inferred finding or an available station', async ({ page }) => {
  const snapshot = fixture(); snapshot.sources = []; snapshot.reviews = [];
  snapshot.coverage = 'Unknown: no evidence collected.';
  await mockSnapshot(page, snapshot);
  await expect(page.getByText('No sources collected. Coverage unknown.', { exact: true })).toBeVisible();
  for (const role of ['intent', 'delivery', 'skeptic'] as const) await expect(station(page, role)).toBeDisabled();
  await expect(page.getByText('No recorded review for this station. Coverage unknown.', { exact: true })).toBeVisible();
  await expect(save(page)).toHaveCount(0);
 });
 test('an inaccessible uncited source cannot expose stale collected content', async ({ page }) => {
  const snapshot = fixture();
  snapshot.sources.push({ ...snapshot.sources[0], id: 'unavailable-source', title: 'Unavailable synthetic source',
   access: 'unavailable', completeness: 'unknown', content: 'STALE PRIVATE CONTENT MUST NOT APPEAR',
   excerpt: '', note: 'Synthetic access denied.' });
  await mockSnapshot(page, snapshot);
  await page.getByRole('region', { name: 'Evidence map' }).getByRole('button', { name: /Unavailable synthetic source/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Source unavailable. Full content cannot be inspected.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('STALE PRIVATE CONTENT MUST NOT APPEAR', { exact: true })).toHaveCount(0);
  await expect(dialog).toContainText('Synthetic access denied.');
 });
 test('a failed GET clears findings and retry retrieves the snapshot', async ({ page }) => {
  await mockSnapshot(page, fixture());
  await page.route('**/api/drift', route => route.fulfill({ status: 503, json: { error: 'Synthetic evidence outage' } }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Synthetic evidence outage');
  await expect(inspector(page)).toHaveCount(0);
  await expect(save(page)).toHaveCount(0);
  await page.route('**/api/drift', route => route.fulfill({ json: fixture() }));
  await page.getByRole('button', { name: 'Retry evidence request', exact: true }).click();
  await expect(inspector(page)).toBeVisible();
 });
 test('mobile evidence and source drilldown fit the viewport and restore keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockSnapshot(page, fixture());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const trigger = page.getByRole('region', { name: 'Evidence map' }).getByRole('button', { name: /Synthetic intent source/ });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Close source drilldown', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(dialog.locator('pre')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Close source drilldown' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
 });
});

test.describe('Drift Room — ACTUAL GET /api/drift integration (no response mocks)', () => {
 test('renders only the recorded backend snapshot with valid literal citation associations', async ({ page }) => {
  // This is distinct from the mocked suite: an unavailable backend is a failure,
  // not a skip or a replacement with synthetic evidence. It proves the deployed
  // adapter/UI boundary, not an upstream transaction or independently collected findings.
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/drift'
   && response.request().method() === 'GET');
  await page.goto('/drift-room');
  const response = await pending;
  expect(response.ok(), `Actual /api/drift returned ${response.status()}`).toBe(true);
  const snapshot = await response.json() as DriftSnapshot;
  expect(snapshot.schemaVersion).toBe(1);
  expect(snapshot.id).toBeTruthy(); expect(snapshot.sources.length).toBeGreaterThan(0);
  const provenance = page.getByRole('region', { name: 'Snapshot provenance' });
  await expect(provenance).toContainText(snapshot.id);
  await expect(provenance).toContainText(snapshot.capturedAt);
  await expect(page.getByText('RECORDED REVIEW · NOT LIVE', { exact: true })).toBeVisible();
  expect(new Set(snapshot.sources.map(source => source.id)).size).toBe(snapshot.sources.length);
  expect(new Set(snapshot.reviews.map(review => review.id)).size).toBe(snapshot.reviews.length);
  const findingIds = snapshot.reviews.flatMap(review => review.findings.map(item => item.id));
  expect(new Set(findingIds).size).toBe(findingIds.length);
  for (const role of ['intent', 'delivery', 'skeptic'] as const) {
   const review = snapshot.reviews.find(item => item.role === role);
   expect(review, `Missing recorded ${role} review`).toBeTruthy();
   expect(review!.mode).toBe('recorded agent review'); expect(review!.snapshotId).toBe(snapshot.id);
   await station(page, role).click();
   await expect(inspector(page)).toContainText(review!.summary);
   for (const item of review!.findings) {
    expect(item.citations.length).toBeGreaterThan(0);
    for (const citation of item.citations) {
     const source = snapshot.sources.find(candidate => candidate.id === citation.sourceId);
     expect(source, `Unknown source ${citation.sourceId}`).toBeTruthy();
     expect(source!.access).toBe('available'); expect(citation.quote.length).toBeGreaterThan(0);
     expect(source!.content).toContain(citation.quote);
    }
   }
  }
  // Drill into an actual backend source, using its returned title/content.
  const source = snapshot.sources.find(item => item.access === 'available');
  expect(source, 'No inspectable actual source').toBeTruthy();
  await page.getByRole('region', { name: 'Evidence map' }).getByRole('button').filter({ hasText: source!.title }).click();
  const dialog = page.getByRole('dialog', { name: source!.title, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('pre')).toHaveText(source!.content || 'No content collected.');
  await expect(dialog).toContainText(source!.revision ?? 'Unknown / not exposed');
 });
});
