// The Mod log page (3.13): who sees it, what an entry shows, filters,
// search, Load more, and entries from before 3.13.

import { expect, test } from '@playwright/test';
import { PHONE, edit, expectNoProblems, pageAs, readDb, serverForFile, text, writeDb } from './helpers.js';

const server = serverForFile();
let page, approved;
const entries = () => page.locator('.modlog-entry');
const pressed = () => page.locator('.admin-modlog__filters [aria-pressed="true"]');
const LEGACY = "Approved Old's edit to corridors-6 (palette)";

test.beforeAll(async () => {
  const as = server.as;
  // Older entries, for Load more, a comment, and one in the format from before 3.13.
  for (let i = 0; i < 55; i++) await edit(as, 'ShopOwner', 'corridors-2', { stock: `stock ${i}` });
  await as('Tester').post('/api/plots/corridors-3/comments', { body: 'Nice stall' });
  const db = writeDb(server);
  db.prepare("INSERT INTO mod_log (actor_name, action, target, details, created_at) VALUES ('ModTester', 'revision.approve', 'plot:corridors-6', ?, datetime('now', '-1 hour'))").run(LEGACY);
  db.close();
  // This run's story: a rejection, then an approval with a fix.
  let r = await edit(as, 'Tester', 'corridors-2', { palette: 'Wrong' }, { summary: 'guess' });
  await as('ShopOwner').post(`/api/revisions/${r.body.id}/reject`, { note: 'Not in game' });
  r = await edit(as, 'Tester', 'corridors-2', { palette: 'Dark oak and grene', description: 'About it' }, { summary: 'saw it' });
  approved = r.body.id;
  await as('ShopOwner').post(`/api/revisions/${approved}/approve`, { values: { palette: 'Dark oak and green' }, note: 'spelling' });
});

test('players have no admin page; moderators have the Mod log', async ({ browser }) => {
  const player = await pageAs(browser, server, 'Tester', PHONE);
  await player.goto('/admin');
  await expect(player.getByText("You don't have access to this page.")).toBeVisible();
  await expect(player.getByRole('button', { name: 'Mod log' })).toHaveCount(0);
  await player.context().close();

  page = await pageAs(browser, server, 'ModTester', PHONE);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Mod log' }).click();
  await expect(page.getByRole('heading', { name: 'Mod log', level: 2 })).toBeVisible();
  await expect(page.locator('.admin-modlog__day h3').first()).toHaveText('Today');
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('an approval with a fix', async () => {
  const entry = entries().first();
  expect(await text(entry.locator('.modlog-entry__head'))).toMatch(/^ShopOwner approved Tester's suggestion, with changes ?\d{1,2}:\d{2}/);
  expect(await text(entry.locator('.modlog-entry__what'))).toBe('ShopOwner: About and Palette');
  await expect(entry.getByRole('link', { name: 'corridors-2' })).toHaveAttribute('href', '/plot/corridors-2');
  await expect(entry.locator('.modlog-entry__where')).toContainText(`#${approved}`);
  await expect(entry.locator('.modlog-entry__note')).toHaveText(['Tester: “saw it”', 'ShopOwner: “spelling”']);
  const details = entry.locator('details');
  await expect(details).not.toHaveAttribute('open');
  expect(await details.textContent(), 'folded text is still on the page').toContain('Dark oak and grene');
  await entry.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open');
  await expect(entry.locator('.revision-changes__label')).toHaveText(['About', 'Palette fixed while approving']);
  await expect(entry.locator('.revision-changes__suggested')).toHaveText('Suggested: Dark oak and grene');
});

test('a rejection with a reason', async () => {
  const entry = entries().filter({ hasText: 'Not in game' }).first();
  expect(await text(entry.locator('.modlog-entry__head'))).toMatch(/^ShopOwner rejected Tester's suggestion/);
  await expect(entry.locator('.modlog-entry__note')).toHaveText(['Tester: “guess”', 'ShopOwner: “Not in game”']);
  await entry.locator('summary').click();
  await expect(entry.locator('ins').first()).toContainText('Wrong');
});

test('filters: one click, one request', async () => {
  const requests = [];
  page.on('request', (r) => { if (r.url().includes('/api/admin/modlog')) requests.push(r.url()); });
  await page.locator('.admin-modlog__filters').getByRole('button', { name: 'Comments' }).click();
  await expect(pressed()).toHaveText('Comments');
  await expect(page.locator('.admin-modlog details')).toHaveCount(0);
  await expect(entries().locator('.modlog-entry__what')).toHaveText([/comment/i]);
  await page.waitForTimeout(500);
  expect(requests, 'no request loop').toHaveLength(1);
  await page.getByRole('button', { name: 'Page edits' }).click();
  await expect(pressed()).toHaveText('Page edits');
  await expect(entries().first().locator('.modlog-entry__head')).toContainText('ShopOwner approved');
  await page.getByRole('button', { name: 'Accounts and tags' }).click();
  await expect(page.getByText('Nothing matches.')).toBeVisible();
  await page.getByRole('button', { name: 'All', exact: true }).click();
});

test('search', async () => {
  const box = page.getByRole('searchbox', { name: 'Search the mod log' });
  await box.fill('Dark oak and grene');
  await expect(entries(), 'typing searches after a pause').toHaveCount(2); // the suggestion and the approval
  await box.fill('no such thing anywhere');
  await box.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Nothing matches.' })).toHaveCount(1);
  await box.fill('corridors-3');
  await box.press('Enter');
  await expect(entries().locator('.modlog-entry__where a')).toHaveText(['corridors-3']);
  await box.fill(LEGACY.slice(0, 30));
  await box.press('Enter');
  await expect(entries().first().locator('.modlog-entry__what'), 'an older entry shows its line').toHaveText(LEGACY);
  await expect(entries().first().locator('details')).toHaveCount(0);
  await box.fill('');
  await box.press('Enter');
  await expect(entries()).toHaveCount(50);
});

test('Load more', async () => {
  const db = readDb(server);
  const total = db.prepare('SELECT count(*) AS n FROM mod_log').get().n;
  db.close();
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(entries()).toHaveCount(Math.min(100, total));
  const heads = await page.locator('.admin-modlog__day h3').allTextContents();
  expect(new Set(heads).size, 'no day heading twice').toBe(heads.length);
});

test('layout on a phone', async () => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const small = await page.locator('.admin-modlog__filters button, .modlog-entry summary')
    .evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 36).length);
  expect(small, 'filters and Show changes are 36px+').toBe(0);
  await expectNoProblems(page);
});
