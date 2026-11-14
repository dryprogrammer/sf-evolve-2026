import { test, expect } from '@playwright/test';

test('five-minute shortcuts reveal the exact evidence sections without changing review state', async ({ page }) => {
  await page.goto('/');
  const guide = page.getByRole('region', { name: 'Five-minute demo path' });
  await expect(guide).toContainText('20% for standard terms. 15% for custom terms.');
  await expect(guide.getByRole('button', { name: 'Inspect policy', exact: true })).toBeEnabled();
  const before = await (await page.request.get('/api/factory')).json();
  for (const [label, id] of [
    ['Inspect policy', 'demo-evidence'],
    ['Open human review', 'review-controls'],
    ['Inspect code and tests', 'implementation-evidence'],
  ]) {
    await guide.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator(`#${id}`)).toBeInViewport();
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await guide.getByRole('button', { name: 'Inspect code and tests', exact: true }).click();
  await expect(page.locator('#implementation-evidence')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await (await page.request.get('/api/factory')).json()).toEqual(before);
});
