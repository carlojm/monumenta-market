// Your edits and Your comments on the account page (3.14): closed sections
// that load when opened, the status line, Show changes, the withdrawn fold.

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, edit, expectNoProblems, pageAs, serverForFile } from './helpers.js';

const server = serverForFile();
const P = 'corridors-2'; // ShopOwner's

// Oldest first: rejected, approved with a fix, waiting.
test.beforeAll(async () => {
  const as = server.as;
  let r = await edit(as, 'Tester', P, { palette: 'Wrong' }, { summary: 'guess' });
  await as('ShopOwner').post(`/api/revisions/${r.body.id}/reject`, { note: 'Not in game' });
  r = await edit(as, 'Tester', 'corridors-1', { palette: 'Dark oak and grene' }, { summary: 'saw it' });
  await as('ModTester').post(`/api/revisions/${r.body.id}/approve`, { values: { palette: 'Dark oak and green' }, note: 'spelling' });
  await edit(as, 'Tester', P, { description: 'New about' });
});

let page;
const requests = [];
const item = (n) => page.locator('.account-edits__list').first().locator(':scope > .account-edit').nth(n);

test('both sections start closed, and nothing loads', async ({ browser }) => {
  page = await pageAs(browser, server, 'Tester', PHONE);
  page.on('request', (r) => { if (/revisions\/mine|me\/comments/.test(r.url())) requests.push(r.url()); });
  await page.goto('/account');
  for (const name of ['Your edits', 'Your comments']) {
    await expect(page.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('heading', { name }), 'still a heading').toHaveCount(1);
  }
  expect(requests).toEqual([]);
});

test('opening with the keyboard loads it, once', async () => {
  const button = page.getByRole('button', { name: 'Your edits' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`[id="${await button.getAttribute('aria-controls')}"]`)).toBeVisible();
  await expect(item(0)).toBeVisible();
  // A production build: one request (in development, StrictMode makes two).
  expect(requests.filter((u) => u.includes('withdrawn=0'))).toHaveLength(1);
  expect(requests.some((u) => u.includes('me/comments')), 'comments not loaded').toBe(false);
  await button.click();
  await expect(item(0)).toBeHidden();
  await button.click();
  await expect(item(0)).toBeVisible();
  expect(requests.filter((u) => u.includes('revisions/mine')), 'reopening loads nothing').toHaveLength(1);
});

test('the status leads each entry', async () => {
  const status = (n) => item(n).locator('.account-edit__status');
  await expect(status(0)).toHaveText('Waiting for review');
  await expect(item(0).getByRole('button', { name: 'Withdraw' })).toBeVisible();
  await expect(status(1)).toHaveText('Approved by ModTester, with changes');
  await expect(status(2)).toHaveText('Rejected by ShopOwner');
  const colors = await Promise.all([0, 1, 2].map((n) => status(n).evaluate((el) => getComputedStyle(el).color)));
  expect(new Set(colors).size, 'three statuses, three colors').toBe(3);
  await expect(status(1).locator('svg[aria-hidden="true"]')).toHaveCount(1);
  await expect(status(1)).toHaveCSS('font-weight', '600');
  expect((await status(0).boundingBox()).y).toBeLessThan((await item(0).locator('.account-edit__shop').boundingBox()).y);
  await expect(item(1).locator('.account-edit__note')).toHaveText(['You: “saw it”', 'ModTester: “spelling”']);
  await expect(item(2).locator('.account-edit__note').nth(1)).toHaveText('ShopOwner: “Not in game”');
  await expect(item(0).locator('a')).toHaveAttribute('href', `/plot/${P}`);
});

test('Show changes', async () => {
  const details = item(1).locator('details');
  await details.locator('summary').click();
  await expect(details.locator('.revision-changes__label')).toHaveText('Palette changed when approved');
  await expect(details.locator('.revision-changes__suggested')).toHaveText('Suggested: Dark oak and grene');
});

test('withdrawn edits fold away, and load when opened', async () => {
  const fold = page.locator('.account-edits__withdrawn');
  await expect(fold, 'nothing withdrawn yet: no fold').toHaveCount(0);
  await item(0).getByRole('button', { name: 'Withdraw' }).click();
  await expect(item(0).locator('.account-edit__status'), 'marked in place').toHaveText('Withdrawn');
  await expect(item(0).getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
  await expect(fold.locator('summary')).toHaveText('Withdrawn (1)');
  expect(requests.some((u) => u.includes('withdrawn=1')), 'not loaded until opened').toBe(false);
  await fold.locator('summary').click();
  await expect(fold.locator('.account-edit__status').first()).toHaveText('Withdrawn');
  await expect(fold.locator('.account-edit').first().locator('a')).toHaveAttribute('href', `/plot/${P}`);
});

test('Your comments opens and loads', async () => {
  await server.as('Tester').post('/api/plots/corridors-3/comments', { body: 'Nice stall' });
  const button = page.getByRole('button', { name: 'Your comments' });
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.account-comments li')).toHaveCount(1);
});

test('layout on a phone', async () => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scrolling').toBe(true);
  const small = await page.locator('.collapsible__toggle, .account-edit summary, .account-edits__withdrawn > summary')
    .evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 36).length);
  expect(small, 'toggles are 36px+ on touch').toBe(0);
  await expectNoProblems(page);
  await page.context().close();
});

test('Load more', async ({ browser }) => {
  for (let i = 0; i < 21; i++) await edit(server.as, 'ShopOwner', P, { palette: `page ${i}` });
  const owner = await pageAs(browser, server, 'ShopOwner', DESKTOP);
  await owner.goto('/account');
  await owner.getByRole('button', { name: 'Your edits' }).click();
  const list = owner.locator('.account-edits__list').first().locator(':scope > .account-edit');
  await expect(list).toHaveCount(20);
  await owner.locator('.account-edits__more').first().click();
  await expect(list).not.toHaveCount(20);
  expect(await list.count()).toBeGreaterThan(20);
});

test('an account with no edits', async ({ browser }) => {
  const empty = await pageAs(browser, server, 'Player2', PHONE);
  await empty.goto('/account');
  await empty.getByRole('button', { name: 'Your edits' }).click();
  await expect(empty.locator('.collapsible__content .account-note').first()).toHaveText('No edits yet. Open a shop on the map and choose Edit.');
});
