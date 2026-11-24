// The card's Comments / History tabs (3.9): an accessible tab pattern,
// History loads when opened, and the Update lines move out of the comments.

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, edit, expectNoProblems, pageAs, serverForFile, writeDb } from './helpers.js';

const server = serverForFile();
const P = 'corridors-2'; // ShopOwner's
let page;
const requests = [];
const tab = (name) => page.getByRole('tab', { name });
const historyPanel = () => page.getByRole('tabpanel', { name: 'History', includeHidden: true });
const entries = () => historyPanel().locator('.shop-history__item');

test.beforeAll(async () => {
  const as = server.as;
  // An old Update line, from before revisions existed.
  const db = writeDb(server);
  const shop = db.prepare('SELECT id FROM shops WHERE plot_id = ? AND closed_at IS NULL').pluck().get(P);
  db.prepare("INSERT INTO comments (shop_id, author, body, is_system, status, created_at) VALUES (?, 'carlo_m', 'description updated from \"a\" to \"b\"', 1, 'approved', '2026-11-01 12:00:00')").run(shop);
  db.close();
  await edit(as, 'ShopOwner', P, { palette: 'Owner palette' }, { summary: 'new blocks' });
  const r = await edit(as, 'Tester', P, { stock: 'Slime and more' }, { summary: 'saw it' });
  await as('ShopOwner').post(`/api/revisions/${r.body.id}/approve`, { note: 'thanks' });
  await as('Tester').post(`/api/plots/${P}/comments`, { body: 'Great shop' });
});

test('the tabs: Comments is selected, History waits', async ({ browser }) => {
  page = await pageAs(browser, server, 'Tester', PHONE);
  page.on('request', (r) => { if (r.url().includes('/history')) requests.push(r.url()); });
  await page.goto(`/plot/${P}`);
  await expect(page.getByRole('tablist', { name: 'Comments and history' })).toBeVisible();
  await expect(tab('Comments')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('History')).toHaveAttribute('aria-selected', 'false');
  await expect(tab('History'), 'only the selected tab is in the Tab order').toHaveAttribute('tabindex', '-1');
  await expect(historyPanel()).toHaveAttribute('hidden', 'until-found');
  expect(requests, 'History not loaded yet').toEqual([]);
});

test('the Update lines left the comments', async () => {
  const comments = page.getByRole('tabpanel', { name: 'Comments' });
  await expect(comments).toContainText('Great shop');
  await expect(comments.locator('.plot-detail__comment--system')).toHaveCount(0);
  await expect(comments, 'not the old line, nor the new edits\' lines').not.toContainText('updated from');
});

test('arrow keys move between the tabs; Enter opens History', async () => {
  await tab('Comments').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('History')).toBeFocused();
  await expect(tab('History'), 'focus alone doesn\'t select').toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('Enter');
  await expect(tab('History')).toHaveAttribute('aria-selected', 'true');
  await expect(historyPanel()).not.toHaveAttribute('hidden');
  await expect(page.getByRole('tabpanel', { name: 'Comments', includeHidden: true })).toHaveAttribute('hidden', 'until-found');
  expect(requests).toHaveLength(1);
});

test('History lists saved changes, newest first, then earlier ones', async () => {
  await expect(entries()).toHaveCount(3); // two saved changes, one earlier line
  const head = (n) => entries().nth(n).locator('.shop-history__head > span');
  await expect(head(0)).toHaveText('Tester edited Keywords, approved by ShopOwner');
  await expect(entries().nth(0).locator('.shop-history__note')).toHaveText(['“saw it”', 'ShopOwner: “thanks”']);
  await expect(head(1)).toHaveText('ShopOwner edited Palette');
  await expect(entries().nth(1).locator('.shop-history__note')).toHaveText('“new blocks”');
  await expect(historyPanel().getByRole('heading', { name: 'Earlier changes' })).toBeVisible();
  await expect(head(2)).toHaveText('description updated from "a" to "b"');
  await expect(entries().nth(2)).toContainText('by carlo_m');

  const details = entries().nth(0).locator('details');
  await details.locator('summary').click();
  await expect(details.locator('.revision-changes__label')).toHaveText(['Keywords']);
  await expect(details.locator('ins').first()).toContainText('Slime and more');
});

test('Comments again keeps History loaded', async () => {
  await tab('Comments').click();
  await tab('History').click();
  await expect(entries()).toHaveCount(3);
  expect(requests, 'no second request').toHaveLength(1);
});

test('layout on a phone', async () => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const name of ['Comments', 'History']) {
    expect((await tab(name).boundingBox()).height, `${name} tab is 36px+`).toBeGreaterThanOrEqual(36);
  }
  await expectNoProblems(page);
  await page.context().close();
});

test("after the owner's edit, History shows it; undo shows too", async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', DESKTOP);
  await page.goto(`/plot/${P}`);
  const card = page.locator('section.plot-detail__sheet');
  await tab('History').click();
  await expect(entries()).toHaveCount(3);
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await card.getByRole('textbox', { name: 'Shop name', exact: true }).fill('Slime Palace');
  await card.getByRole('button', { name: 'Force edit' }).click();
  await expect(card.locator('.plot-detail__notice')).toContainText('Edit saved.');
  await expect(entries().first().locator('.shop-history__head > span'), 'reloaded with the new change').toHaveText('ShopOwner edited Shop name');
  await card.locator('.plot-detail__notice').getByRole('button', { name: 'Undo' }).click();
  await expect(card.locator('.plot-detail__notice')).toContainText('Edit undone.');
  await expect(entries().first().locator('.shop-history__head > span')).toHaveText('ShopOwner undid a change');
  await expectNoProblems(page);
  await page.context().close();
});

test('a vacant plot shows its history', async ({ browser }) => {
  const vacant = (await server.as(null).get('/api/plots')).body.find((p) => !p.shop).id;
  await server.as('ModTester').post(`/api/plots/${vacant}/revisions`, { action: 'open', proposed: { owner: 'Visitor', tag_ids: [] } });
  await server.as('ModTester').post(`/api/plots/${vacant}/revisions`, { action: 'vacate' });
  page = await pageAs(browser, server, null, PHONE);
  await page.goto(`/plot/${vacant}`);
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.locator('.shop-history__head > span')).toHaveText(['ModTester closed Visitor', 'ModTester opened a new shop for Visitor']);
  await expectNoProblems(page);
});

test('earlier shops sit under History, with their comments folded', async ({ browser }) => {
  // corridors-5 has past shops in the imported data; give its last one a name
  // that differs from the owner, and a comment.
  const db = writeDb(server);
  const past = db.prepare("SELECT * FROM shops WHERE plot_id = 'corridors-5' AND closed_at IS NOT NULL ORDER BY closed_at DESC").get();
  db.prepare("UPDATE shops SET shop_name = 'Old Barrels', stock = 'barrels' WHERE id = ?").run(past.id);
  db.prepare("INSERT INTO comments (shop_id, author, body, is_system, status) VALUES (?, 'Tester', 'Loved the review wall', 0, 'approved'), (?, NULL, 'palette updated', 1, 'approved')").run(past.id, past.id);
  db.close();
  page = await pageAs(browser, server, null, PHONE);
  await page.goto('/plot/corridors-5');
  const section = page.getByRole('region', { name: 'Earlier shops on this plot' });
  await expect(section).toBeVisible(); // a vacant plot: History is the only section
  await expect(page.getByRole('heading', { name: 'Past shops' }), 'the old section is gone').toHaveCount(0);
  const shop = section.locator('.plot-detail__past-shop').first();
  await shop.locator(':scope > summary').click();
  await expect(shop.locator(':scope > summary')).toContainText('Old Barrels');
  await expect(shop.locator('.plot-detail__meta dt')).toContainText(['Owner', 'About', 'Keywords']);
  await expect(shop.locator('.plot-detail__meta dd').first()).toHaveText(past.owner);
  const comments = shop.locator('.plot-detail__past-comments');
  await expect(comments, 'folded at first').not.toHaveAttribute('open');
  await comments.locator('summary').click();
  await expect(comments).toContainText('Loved the review wall');
  await expect(comments, 'players\' comments only').not.toContainText('palette updated');
  const shown = await comments.locator('.plot-detail__comments > li').count();
  await expect(comments.locator('summary'), 'the count matches').toHaveText(`Comments (${shown})`);
  await expectNoProblems(page);
});

test('Restore this version: owners publish it, players suggest it', async ({ browser }) => {
  const as = server.as;
  await edit(as, 'ShopOwner', P, { palette: 'First version' });
  await edit(as, 'ShopOwner', P, { palette: 'Second version' });
  const restoreButtons = () => historyPanel().getByRole('button', { name: /^(Restore this version|Suggest restoring this version)$/ });

  // Logged out: nothing to restore with.
  page = await pageAs(browser, server, null, PHONE);
  await page.goto(`/plot/${P}`);
  await tab('History').click();
  await expect(entries().first()).toContainText('ShopOwner edited Palette');
  await expect(restoreButtons()).toHaveCount(0);
  await page.context().close();

  // The owner: the newest entry is the page as it is, so no button there.
  page = await pageAs(browser, server, 'ShopOwner', PHONE);
  await page.goto(`/plot/${P}`);
  await tab('History').click();
  await expect(entries().first().getByRole('button', { name: 'Restore this version' })).toHaveCount(0);
  const older = entries().nth(1);
  await expect(older.locator('.shop-history__head > span')).toHaveText('ShopOwner edited Palette');
  await older.getByRole('button', { name: 'Restore this version' }).click();
  await expect(older.getByText('The page goes back to how it was after this change.')).toBeVisible();
  await expect(older.getByRole('button', { name: 'Cancel' }), 'focus on the safe choice').toBeFocused();
  await older.getByRole('button', { name: 'Cancel' }).click();
  await older.getByRole('button', { name: 'Restore this version' }).click();
  await older.getByRole('button', { name: 'Restore', exact: true }).click();
  const card = page.locator('dialog');
  await expect(card.locator('.plot-detail__notice')).toContainText('Edit saved.');
  await expect(card.locator('.plot-detail__notice').getByRole('button', { name: 'Undo' }), 'undo works for a restore too').toBeVisible();
  await expect(card.locator('.plot-detail__meta')).toContainText('First version');
  await expect(entries().first().locator('.shop-history__note')).toContainText('Restored the version from');
  await expectNoProblems(page);
  await page.context().close();

  // A player suggests it instead.
  page = await pageAs(browser, server, 'Player2', PHONE);
  await page.goto(`/plot/${P}`);
  await tab('History').click();
  const suggest = entries().nth(1).getByRole('button', { name: 'Suggest restoring this version' });
  await suggest.click();
  await expect(entries().nth(1).getByText('The owner or a moderator reviews it before it shows.')).toBeVisible();
  await entries().nth(1).getByRole('button', { name: 'Suggest', exact: true }).click();
  await expect(page.locator('dialog .plot-detail__notice')).toContainText('Sent for review');
  await expectNoProblems(page);
});
