// Edit and approve (3.5): a reviewer fixes a suggestion before approving it,
// including a field that clashed.

import { expect, test } from '@playwright/test';
import { PHONE, edit, expectNoProblems, pageAs, readDb, serverForFile } from './helpers.js';

const server = serverForFile();
const query = (sql, ...args) => { const db = readDb(server); try { return db.prepare(sql).get(...args); } finally { db.close(); } };
const shopOn = (plot) => query('SELECT * FROM shops WHERE plot_id = ? AND closed_at IS NULL', plot);
const suggest = async (plot, changes, summary) => (await edit(server.as, 'Tester', plot, changes, { summary })).body.id;
const box = (item, name) => item.getByRole('textbox', { name, exact: true });
let page;

async function firstPending() {
  await page.reload();
  await page.locator('.pending-edits').getByRole('button', { name: 'Show' }).click();
  return page.locator('.pending-edits__list > li').first();
}
const notice = (text) => expect(page.locator('dialog .plot-detail__notice')).toContainText(text);

test('fix a typo, then approve', async ({ browser }) => {
  const id = await suggest('corridors-2', { palette: 'Dark oak and grene', description: 'Desc' }, 'typo fix');
  page = await pageAs(browser, server, 'ShopOwner', PHONE);
  await page.goto('/plot/corridors-2');
  const item = await firstPending();
  await item.getByRole('button', { name: 'Edit and approve' }).click();
  await expect(box(item, 'Palette')).toHaveValue('Dark oak and grene');
  await expect(box(item, 'About')).toHaveValue('Desc');
  expect(await box(item, 'About').evaluate((e) => e.tagName), 'About is multi-line').toBe('TEXTAREA');
  await expect(item.getByRole('textbox', { name: 'Shop name' }), 'only the fields it changes').toHaveCount(0);
  await expect(item.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(item.getByRole('button', { name: 'Reject' })).toHaveCount(0);
  await box(item, 'Palette').fill('Dark oak and green');
  await item.getByRole('button', { name: 'Approve', exact: true }).click();
  await notice('Edit approved.');
  expect(shopOn('corridors-2')).toMatchObject({ palette: 'Dark oak and green', description: 'Desc' });
  const r = query('SELECT proposed, new_values FROM revisions WHERE id = ?', id);
  expect(JSON.parse(r.proposed).palette, 'the suggestion keeps what was asked').toBe('Dark oak and grene');
  expect(JSON.parse(r.new_values).palette).toBe('Dark oak and green');
});

test('Cancel goes back, and starts over next time', async () => {
  await suggest('corridors-2', { palette: 'Cancel me' });
  const item = await firstPending();
  await item.getByRole('button', { name: 'Edit and approve' }).click();
  await box(item, 'Palette').fill('changed my mind');
  await item.getByRole('button', { name: 'Cancel' }).click();
  await expect(item.getByRole('button', { name: 'Reject' })).toBeVisible();
  await expect(item.getByRole('textbox')).toHaveCount(0);
  await item.getByRole('button', { name: 'Edit and approve' }).click();
  await expect(box(item, 'Palette')).toHaveValue('Cancel me');
  await item.getByRole('button', { name: 'Cancel' }).click();
  await item.getByRole('button', { name: 'Reject' }).click();
  await item.getByRole('button', { name: 'Reject' }).click();
  await notice('Edit rejected.');
});

test('a clash: pick a version, then edit it', async () => {
  await suggest('corridors-2', { description: 'Suggested about', palette: 'Pal' });
  await edit(server.as, 'ModTester', 'corridors-2', { description: 'Mod about' });
  const item = await firstPending();
  await item.getByRole('button', { name: 'Edit and approve' }).click();
  const group = item.getByRole('group', { name: 'About' });
  await expect(group.getByRole('radio', { name: /Suggested/ })).toBeVisible();
  await expect(group.getByRole('textbox'), 'no box until a version is picked').toHaveCount(0);
  await item.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(item.getByRole('alert')).toHaveText('Choose a version for each field first.');
  await group.getByRole('radio', { name: /Current/ }).check();
  const keep = group.getByRole('textbox', { name: 'Text to keep' });
  await expect(keep).toHaveValue('Mod about');
  await expect(item.getByRole('alert'), 'the error clears').toHaveCount(0);
  await group.getByRole('radio', { name: /Suggested/ }).check();
  await expect(keep).toHaveValue('Suggested about');
  await keep.fill('Mod about, plus suggested bits');
  await item.getByRole('button', { name: 'Approve', exact: true }).click();
  await notice('Edit approved.');
  expect(shopOn('corridors-2')).toMatchObject({ description: 'Mod about, plus suggested bits', palette: 'Pal' });
});

test('a version picked in the resolve step carries over', async () => {
  await suggest('corridors-2', { description: 'S2' });
  await edit(server.as, 'ModTester', 'corridors-2', { description: 'M2' });
  const item = await firstPending();
  await item.getByRole('button', { name: 'Approve', exact: true }).click();
  await item.getByRole('radio', { name: /Current/ }).check();
  await item.getByRole('button', { name: 'Edit and approve' }).click();
  await expect(item.getByRole('textbox', { name: 'Text to keep' })).toHaveValue('M2');
  await item.getByRole('button', { name: 'Cancel' }).click();
  await item.getByRole('button', { name: 'Reject' }).click();
  await item.getByRole('button', { name: 'Reject' }).click();
  await notice('Edit rejected.');
  await expectNoProblems(page);
  await page.context().close();
});

test('a new shop in Needs review: the owner is editable, and checked', async ({ browser }) => {
  await server.as('Tester').post('/api/plots/corridors-7/revisions',
    { action: 'open', proposed: { owner: 'Newcomr', description: 'New' }, summary: 'saw it' });
  page = await pageAs(browser, server, 'ModTester', PHONE);
  await page.goto('/admin');
  const item = page.locator('.admin-review__item').filter({ hasText: 'Newcomr' });
  await item.getByRole('button', { name: 'Edit and approve' }).click();
  await expect(box(item, 'Owner')).toHaveValue('Newcomr');
  await expect(box(item, 'About')).toHaveValue('New');
  await box(item, 'Owner').fill('');
  await item.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(item.getByRole('alert')).toHaveText('A new shop needs an owner.');
  await expect(item.getByRole('button', { name: 'Approve', exact: true }), 'the buttons work again').toBeEnabled();
  await box(item, 'Owner').fill('Newcomer');
  await item.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.locator('.admin-review__status')).toHaveText(/^Approved/);
  expect(shopOn('corridors-7').owner).toBe('Newcomer');
  await page.context().close();
});

test('no Edit and approve on "The plot is now empty"', async ({ browser }) => {
  await server.as('ModTester').post('/api/plots/corridors-1/revisions', { action: 'vacate', summary: 'empty', request_review: true });
  page = await pageAs(browser, server, 'ModTester', PHONE);
  await page.goto('/plot/corridors-1');
  await page.locator('.pending-edits').getByRole('button', { name: 'Show' }).click();
  const item = page.locator('.pending-edits__list > li').filter({ hasText: 'The plot is now empty' });
  await expect(item.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  await expect(item.getByRole('button', { name: 'Edit and approve' })).toHaveCount(0);
  await expectNoProblems(page);
});
