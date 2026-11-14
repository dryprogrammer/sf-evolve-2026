import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import type { FactoryView } from '../../src/lib/contracts';

const STORAGE_KEY = 'factory-room-session';
const people = ['Maya', 'Alex', 'River'] as const;
type RoomTabs = { contexts: BrowserContext[]; pages: Page[] };

// Explicit independent contexts, not three pages sharing one context. Leave every
// issued credential (including duplicated tabs) so later tests see no ghost avatars.
const test = base.extend<{ roomTabs: RoomTabs }>({
  roomTabs: async ({ browser, baseURL }, use) => {
    const contexts: BrowserContext[] = [];
    try {
      for (let i = 0; i < 3; i++) contexts.push(await browser.newContext({ baseURL }));
      const pages = await Promise.all(contexts.map(context => context.newPage()));
      await use({ contexts, pages });
    } finally {
      for (const context of contexts) {
        await context.setOffline(false);
        for (const page of context.pages()) {
          if (page.isClosed() || !page.url().startsWith(baseURL!)) continue;
          await page.evaluate(async key => {
            const raw = sessionStorage.getItem(key);
            if (!raw) return;
            const { token } = JSON.parse(raw);
            await fetch('/api/room/session', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ action: 'leave' }),
            });
          }, STORAGE_KEY).catch(() => {});
        }
        await context.close();
      }
    }
  },
});
test.setTimeout(60000);

async function entry(page: Page) {
  await expect(page.getByRole('heading', { name: 'Who is in this tab?' })).toBeVisible();
  for (const name of people) await expect(page.getByRole('button', { name: `Enter as ${name}` })).toBeVisible();
  await expect(page.getByText('Demo identities — simulated, not authenticated accounts', { exact: true })).toBeVisible();
  await expect(page.getByText('Simulated demo identity', { exact: true })).toHaveCount(3);
  await expect(page.getByTestId('room-identity')).toHaveCount(0);
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), STORAGE_KEY)).toBeNull();
}
async function enterAll({ pages }: RoomTabs) {
  // Finish each handshake before adding the next session; no fixed sleeps.
  for (const [i, page] of pages.entries()) {
    await page.goto('/room');
    await entry(page);
    await page.getByRole('button', { name: `Enter as ${people[i]}` }).click();
    await expect(page.getByTestId('room-identity')).toHaveText(`You are ${people[i]} (demo)`, { timeout: 15000 });
    await expect(page.getByTestId('room-link')).toHaveText('Live', { timeout: 15000 });
    await expect(page.getByLabel('Your working notes')).toBeVisible({ timeout: 15000 });
  }
  for (const page of pages) {
    await expect(page.locator('canvas')).toHaveAttribute('data-remotes', '2', { timeout: 15000 });
    for (const name of people) {
      const roster = page.getByTestId(`roster-${name.toLowerCase()}`);
      await expect(roster.locator('.room-connectivity')).toHaveText('Presence: connected', { timeout: 15000 });
      await expect(roster).toContainText('Review (persisted):');
      await expect(roster.locator('.room-demo-tag')).toHaveText('demo');
    }
  }
}
async function credential(page: Page): Promise<{ sessionId: string; token: string; participantId: string }> {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), STORAGE_KEY);
}
async function createRound(page: Page): Promise<FactoryView> {
  const result = await page.evaluate(async key => {
    const session = JSON.parse(sessionStorage.getItem(key)!);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` };
    const currentResponse = await fetch('/api/factory', { headers, cache: 'no-store' });
    if (!currentResponse.ok) throw new Error(`Read failed: ${currentResponse.status}`);
    const current = await currentResponse.json();
    const response = await fetch('/api/factory', {
      method: 'POST', headers,
      body: JSON.stringify({ operation: 'create_round', expectedVersion: current.version,
        expectedPrincipalId: session.participantId, idempotencyKey: crypto.randomUUID(), payload: {} }),
    });
    return { status: response.status, view: await response.json(), previousCount: current.rounds.length };
  }, STORAGE_KEY);
  expect(result.status).toBe(200);
  expect(result.view.rounds).toHaveLength(result.previousCount + 1);
  expect(result.view.history.at(-1)).toMatchObject({ actorId: 'maya', type: 'create_round' });
  return result.view;
}
async function showsRound(page: Page, view: FactoryView) {
  const latest = view.rounds.at(-1)!;
  await expect(page.getByLabel('Current & prior rounds').locator(`option[value="${latest.id}"]`))
    .toHaveText(`Round ${view.rounds.length} · draft · newest`, { timeout: 15000 });
  await expect(page.locator('#room-inspector footer')).toContainText(`aggregate version ${view.version}`, { timeout: 15000 });
}

test('AC-SPR-001.1/.2/.5 + AC-SFF-007.1: explicit demo identities share three connected avatars', async ({ roomTabs }) => {
  await enterAll(roomTabs);
  const credentials = await Promise.all(roomTabs.pages.map(credential));
  expect(new Set(credentials.map(s => s.sessionId)).size).toBe(3);
  expect(credentials.map(s => s.participantId)).toEqual(['maya', 'alex', 'river']);
});

test('AC-SPR-001.6/.3: reload retains Alex; River leaves without changing other identities', async ({ roomTabs }) => {
  await enterAll(roomTabs);
  const [maya, alex, river] = roomTabs.pages;
  const original = await Promise.all([maya, alex].map(credential));
  await alex.reload();
  await expect(alex.getByTestId('room-identity')).toHaveText('You are Alex (demo)', { timeout: 15000 });
  await expect(alex.getByRole('heading', { name: 'Who is in this tab?' })).toHaveCount(0);
  await expect(alex.getByTestId('room-link')).toHaveText('Live', { timeout: 15000 });
  expect(await credential(alex)).toEqual(original[1]);
  await river.getByRole('button', { name: 'Leave room', exact: true }).click();
  await entry(river);
  for (const [i, page] of [maya, alex].entries()) {
    await expect(page.getByTestId('room-identity')).toHaveText(`You are ${people[i]} (demo)`);
    expect(await credential(page)).toEqual(original[i]);
    await expect(page.getByTestId('roster-river').locator('.room-connectivity'))
      .toHaveText('Presence: not in room', { timeout: 10000 });
    await expect(page.locator('canvas')).toHaveAttribute('data-remotes', '1', { timeout: 10000 });
  }
});

test('AC-SPR-004.1/.2: confirmed Maya revision updates Alex inspector without losing unsent draft', async ({ roomTabs }) => {
  await enterAll(roomTabs);
  const [maya, alex] = roomTabs.pages;
  const unsent = 'Alex unsent finance notes — preserve across a remote revision';
  await alex.getByLabel('Your working notes').fill(unsent);
  const view = await createRound(maya);
  await showsRound(alex, view);
  await expect(alex.getByLabel('Your working notes')).toHaveValue(unsent);
  // The server projection must not contain the unsent edit.
  const saved = await alex.evaluate(async key => {
    const { token } = JSON.parse(sessionStorage.getItem(key)!);
    return (await (await fetch('/api/factory', { headers: { Authorization: `Bearer ${token}` } })).json()).draft?.text;
  }, STORAGE_KEY);
  expect(saved).not.toBe(unsent);
});

test('AC-SPR-004.3/.4: disconnected alert clears on reconnect and missed revision reconciles', async ({ roomTabs }) => {
  await enterAll(roomTabs);
  const [maya, alex] = roomTabs.pages;
  await roomTabs.contexts[1].setOffline(true);
  await expect(alex.getByTestId('room-link')).toHaveAttribute('role', 'alert', { timeout: 15000 });
  await expect(alex.getByTestId('room-link')).toContainText('Disconnected', { timeout: 15000 });
  const view = await createRound(maya);
  await expect(alex.getByLabel('Current & prior rounds').locator(`option[value="${view.rounds.at(-1)!.id}"]`)).toHaveCount(0);
  await roomTabs.contexts[1].setOffline(false);
  await expect(alex.getByTestId('room-link')).toHaveText('Live', { timeout: 15000 });
  await expect(alex.getByTestId('room-link')).not.toHaveAttribute('role', 'alert');
  await showsRound(alex, view);
  await expect(alex.locator('canvas')).toHaveAttribute('data-remotes', '2', { timeout: 15000 });
});

test('AC-SPR-001.5: duplicated Maya tab forks its copied credential into a separate avatar', async ({ roomTabs }) => {
  await enterAll(roomTabs);
  const maya = roomTabs.pages[0];
  const original = await credential(maya);
  const copied = await maya.evaluate(key => sessionStorage.getItem(key)!, STORAGE_KEY);
  const duplicate = await roomTabs.contexts[0].newPage();
  await duplicate.goto('/room');
  await entry(duplicate);
  await duplicate.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), { key: STORAGE_KEY, raw: copied });
  await duplicate.reload();
  await expect(duplicate.getByTestId('room-identity')).toHaveText('You are Maya (demo)', { timeout: 15000 });
  await expect(duplicate.getByText('Duplicated tab:', { exact: false })).toBeVisible();
  const forked = await credential(duplicate);
  expect(forked.participantId).toBe('maya');
  expect(forked.sessionId).not.toBe(original.sessionId);
  expect(forked.token).not.toBe(original.token);
  expect(await credential(maya)).toEqual(original);
  for (const page of [...roomTabs.pages, duplicate]) {
    await expect(page.locator('canvas')).toHaveAttribute('data-remotes', '3', { timeout: 15000 });
    await expect(page.getByTestId('roster-maya').locator('.room-connectivity'))
      .toHaveText('Presence: connected in 2 tabs', { timeout: 15000 });
  }
});

test('AC-SFF-007.4: reduced motion retains connected remote avatars', async ({ roomTabs }) => {
  await roomTabs.pages[1].emulateMedia({ reducedMotion: 'reduce' });
  await enterAll(roomTabs);
  expect(await roomTabs.pages[1].evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(roomTabs.pages[1].locator('canvas')).toHaveAttribute('data-remotes', '2');
});
