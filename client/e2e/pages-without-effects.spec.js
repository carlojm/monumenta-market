// The parts reworked without useEffect (4.11) that no other test covered:
// the admin Tags, Auto-tag, Comments and Accounts pages, the plot editor's
// leave warning, the toolbar menus closing, and the phone/desktop switch.

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, expectNoProblems, pageAs, readDb, serverForFile } from './helpers.js';

const server = serverForFile();
const query = (sql, ...args) => { const db = readDb(server); try { return db.prepare(sql).get(...args); } finally { db.close(); } };
let page;
const adminTab = (name) => page.locator('.admin-page__tabs').getByRole('button', { name, exact: true });

test('admin Tags: loads, and adding a tag shows it', async ({ browser }) => {
  page = await pageAs(browser, server, 'ModTester', DESKTOP);
  await page.goto('/admin');
  await adminTab('Tags').click();
  await expect(page.getByPlaceholder('Find a tag (names and aliases)…')).toBeVisible();
  await page.getByRole('button', { name: '+ Add a tag' }).click();
  await page.getByLabel('Kind').selectOption('category');
  await page.getByLabel('Name', { exact: true }).fill('Test Category');
  await page.getByRole('button', { name: 'Add tag' }).click();
  await page.getByPlaceholder('Find a tag (names and aliases)…').fill('Test Category');
  await expect(page.getByText('Test Category').first(), 'the page reloaded with it').toBeVisible();
  expect(query("SELECT status FROM tags WHERE name = 'Test Category'").status).toBe('approved');
});

test('admin Auto-tag: confident matches start ticked; a click unticks; adding works', async () => {
  await page.getByText('Auto-tag shops from their descriptions').click();
  const bar = page.locator('.admin-autotag__bar');
  await expect(bar).toContainText('tags ticked');
  const count = async () => Number((await bar.textContent()).match(/(\d+) tags ticked/)[1]);
  const start = await count();
  expect(start, 'some start ticked').toBeGreaterThan(0);
  const first = page.locator('.admin-autotag button[aria-pressed="true"]').first();
  await first.click();
  await expect(bar).toContainText(`${start - 1} tags ticked`);
  await page.getByRole('button', { name: 'Add ticked tags' }).click();
  const before = query("SELECT count(*) AS n FROM revisions WHERE summary = 'Auto-tagged from the description'").n;
  await page.getByRole('button', { name: `Yes, add ${start - 1} tags` }).click();
  await expect(bar, 'what is left starts unticked').toContainText('0 tags ticked');
  expect(query("SELECT count(*) AS n FROM revisions WHERE summary = 'Auto-tagged from the description'").n).toBeGreaterThan(before);
  await expectNoProblems(page);
});

test('admin Comments: lists, searches as you type, deletes', async () => {
  await server.as('Tester').post('/api/plots/corridors-3/comments', { body: 'Findable needle comment' });
  await adminTab('Comments').click();
  const items = page.locator('.admin-comments li');
  await expect(items.first()).toBeVisible();
  await page.getByPlaceholder(/Search comment text/).fill('needle');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Findable needle comment');
  await items.first().getByRole('button', { name: 'Delete' }).click();
  await items.first().getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByText('No comments found.')).toBeVisible();
  // Coming back to the tab keeps the search.
  await adminTab('Tags').click();
  await adminTab('Comments').click();
  await expect(page.getByPlaceholder(/Search comment text/)).toHaveValue('needle');
  await expectNoProblems(page);
  await page.context().close();
});

test('admin Accounts: search, and make a moderator', async ({ browser }) => {
  page = await pageAs(browser, server, 'AdminTester', DESKTOP);
  await page.goto('/admin');
  await adminTab('Accounts').click();
  await page.getByPlaceholder(/Search by Minecraft name/).fill('Player2');
  const rows = page.locator('.admin-accounts li');
  await expect(rows).toHaveCount(1);
  await rows.first().getByRole('button', { name: 'Make moderator' }).click();
  await expect(rows.first()).toContainText('Moderator');
  expect(query("SELECT role FROM accounts WHERE name = 'Player2'").role).toBe('moderator');
  await expectNoProblems(page);
  await page.context().close();
});

test('the plot editor warns before leaving only with unsaved edits', async ({ browser }) => {
  async function warns(edit) {
    const p = await pageAs(browser, server, 'ModTester', DESKTOP);
    await p.goto('/admin');
    await p.locator('.admin-page__tabs').getByRole('button', { name: 'Plots', exact: true }).click();
    await p.getByRole('button', { name: /corridors-2/ }).first().click();
    await expect(p.getByLabel('Block palette')).toBeVisible();
    await edit(p);
    let warned = false;
    p.on('dialog', async (d) => { if (d.type() === 'beforeunload') warned = true; await d.accept(); });
    await p.close({ runBeforeUnload: true });
    await new Promise((r) => setTimeout(r, 500));
    await p.context().close();
    return warned;
  }
  expect(await warns(async () => {}), 'nothing changed').toBe(false);
  expect(await warns((p) => p.getByLabel('Block palette').fill('changed')), 'unsaved edits').toBe(true);
});

test('the toolbar menus close on a click outside and on Escape', async ({ browser }) => {
  page = await pageAs(browser, server, null, DESKTOP);
  await page.goto('/');
  const sortButton = page.locator('.toolbar__menu-wrap').filter({ has: page.locator('.toolbar__label--narrow', { hasText: 'Sort' }) }).locator('.toolbar__button');
  await sortButton.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.getByRole('menu'), 'a click outside closes it').toHaveCount(0);
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu'), 'Escape closes it').toHaveCount(0);
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: /Hide vacant plots/ }).click();
  await expect(page.locator('.filters__chip')).toHaveCount(1);
  await expectNoProblems(page);
});

test('the card follows the window: inline on desktop, a dialog on a phone', async () => {
  await page.goto('/plot/corridors-2');
  await expect(page.locator('section.plot-detail__sheet--inline')).toBeVisible();
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.setViewportSize(PHONE.viewport);
  await expect(page.locator('dialog'), 'resizing switches it').toBeVisible();
  await page.setViewportSize(DESKTOP.viewport);
  await expect(page.locator('section.plot-detail__sheet--inline')).toBeVisible();
  await expectNoProblems(page);
});
