// The edit form's modes (3.3c): "The plot is now empty" and "A new shop is
// here", for a player, an owner and a moderator.

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, expectNoProblems, pageAs, readDb, serverForFile } from './helpers.js';

const server = serverForFile();
const query = (sql, ...args) => { const db = readDb(server); try { return db.prepare(sql).get(...args); } finally { db.close(); } };
const currentShop = (plot) => query('SELECT * FROM shops WHERE plot_id = ? AND closed_at IS NULL', plot);
const lastRevision = () => query('SELECT * FROM revisions ORDER BY id DESC LIMIT 1');
const textbox = (form, name) => form.getByRole('textbox', { name, exact: true });
let page, card, form;

async function withdrawPending() {
  const pending = card.locator('.pending-edits');
  await pending.getByRole('button', { name: 'Show' }).click();
  await pending.getByRole('button', { name: 'Withdraw' }).click();
  await expect(card.locator('.plot-detail__notice')).toContainText('Suggestion withdrawn.');
}

test('a player: the plot is now empty', async ({ browser }) => {
  page = await pageAs(browser, server, 'Tester', PHONE);
  await page.goto('/plot/corridors-1');
  card = page.locator('dialog');
  form = card.locator('form.shop-edit');
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(form.getByText('Not the same shop anymore?')).toBeVisible();
  await expect(form.getByRole('button', { name: 'The plot is now empty' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'A new shop is here' })).toBeVisible();

  await textbox(form, 'Palette').fill('Kept palette');
  await form.getByRole('button', { name: 'The plot is now empty' }).click();
  const heading = form.locator('h3');
  await expect(heading).toHaveText('The plot is now empty');
  await expect(heading, 'focus moves to the new heading').toBeFocused();
  await expect(form.getByText('A moderator reviews it before it shows.')).toBeVisible();
  await expect(form.getByText('skelajon closes. It stays under History, with its comments.')).toBeVisible();
  await expect(form.locator('textarea')).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Show changes' })).toHaveCount(0);
  await expect(form.getByLabel('How do you know?')).toBeVisible();

  await form.getByRole('button', { name: 'Edit skelajon instead' }).click();
  await expect(textbox(form, 'Palette'), 'the draft survives switching').toHaveValue('Kept palette');
  await expect(form.getByRole('button', { name: 'Undo changes to Palette' })).toBeVisible();
  await form.getByRole('button', { name: 'Undo changes to Palette' }).click();

  await form.getByRole('button', { name: 'The plot is now empty' }).click();
  await form.getByLabel('How do you know?').fill('Walked past, empty lot');
  await form.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(card.locator('.plot-detail__notice')).toContainText('Sent for review');
  expect(lastRevision()).toMatchObject({ action: 'vacate', status: 'pending', summary: 'Walked past, empty lot' });
  expect(currentShop('corridors-1'), 'the shop is still open').toBeTruthy();
});

test('a player: a new shop is here', async () => {
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await form.getByRole('button', { name: 'A new shop is here' }).click();
  await expect(form.locator('h3')).toHaveText('A new shop is here');
  await expect(form.getByText('skelajon closes. It stays under History')).toBeVisible();
  await expect(textbox(form, 'Owner')).toHaveValue('');
  await expect(textbox(form, 'About')).toHaveValue('');
  await expect(form.locator('.tag-picker__chosen')).toContainText('No tags yet');

  await form.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(form.getByRole('alert')).toContainText("haven't changed");
  await textbox(form, 'About').fill('Potions and brews');
  await expect(form.locator('.shop-edit__edited'), 'no Edited markers in a new shop').toHaveCount(0);
  await form.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(form.getByRole('alert')).toHaveText('A new shop needs an owner.');
  await textbox(form, 'Owner').fill('skelajon');
  await form.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(form.getByRole('alert'), 'same owner: edit instead').toContainText('already owns');

  await textbox(form, 'Owner').fill('NewGuy');
  await form.getByRole('button', { name: 'Show changes' }).click();
  await expect(form.locator('.shop-edit__changes .shop-edit__label-row')).toHaveText(['Owner', 'About']);
  await expect(form.locator('.shop-edit__changes del'), 'all added').toHaveCount(0);
  await form.getByRole('button', { name: 'Back to editing' }).click();
  await form.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(card.locator('.plot-detail__notice')).toContainText('replaces your earlier suggestion');
  const r = lastRevision();
  expect(r).toMatchObject({ action: 'open', status: 'pending' });
  expect(JSON.parse(r.proposed)).toMatchObject({ owner: 'NewGuy', description: 'Potions and brews' });
  expect(query("SELECT status FROM revisions WHERE action = 'vacate' ORDER BY id DESC").status, 'replaced the closure').toBe('withdrawn');
  await withdrawPending();
});

test('a player: a vacant plot', async () => {
  const vacant = (await server.as(null).get('/api/plots')).body.find((p) => !p.shop).id;
  await page.goto(`/plot/${vacant}`);
  await card.getByRole('button', { name: 'Add shop' }).click();
  await expect(form.locator('h3')).toHaveText('A new shop is here');
  await expect(form.locator('.shop-edit__warning')).toHaveCount(0);
  await expect(form.getByText('Not the same shop')).toHaveCount(0);
  await textbox(form, 'Owner').fill('Vacant Taker');
  await form.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(card.locator('.plot-detail__notice')).toContainText('Sent for review');
  expect(lastRevision()).toMatchObject({ action: 'open', shop_id: null, status: 'pending' });
  await withdrawPending();
  await expectNoProblems(page, { statuses: [400] }); // "already owns this shop", earlier
  await page.context().close();
});

test('an owner: closing or replacing their shop needs a moderator', async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', DESKTOP);
  await page.goto('/plot/corridors-2');
  card = page.locator('dialog, section.plot-detail__sheet').first();
  form = card.locator('form.shop-edit');
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Force edit' })).toBeVisible();
  await form.getByRole('button', { name: 'The plot is now empty' }).click();
  await expect(form.getByRole('button', { name: 'Force edit' })).toHaveCount(0);
  await expect(form.getByText('A moderator reviews it')).toBeVisible();
  await form.getByRole('button', { name: 'Edit ShopOwner instead' }).click();
  await expect(form.getByRole('button', { name: 'Force edit' })).toBeVisible();
  await page.context().close();
});

test('a moderator publishes a new shop, then closes it', async ({ browser }) => {
  page = await pageAs(browser, server, 'ModTester', PHONE);
  const old = currentShop('corridors-7');
  await page.goto('/plot/corridors-7');
  card = page.locator('dialog');
  form = card.locator('form.shop-edit');
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await form.getByRole('button', { name: 'A new shop is here' }).click();
  await textbox(form, 'Owner').fill('FreshOwner');
  await textbox(form, 'Shop name').fill('Fresh Finds');
  await form.getByRole('button', { name: 'Force edit' }).click();
  await expect(card.locator('h2')).toContainText('Fresh Finds');
  expect(query('SELECT closed_at FROM shops WHERE id = ?', old.id).closed_at).toBeTruthy();
  expect(currentShop('corridors-7').owner).toBe('FreshOwner');
  await expect(card.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
  await card.getByRole('tab', { name: 'History' }).click();
  await expect(card.getByRole('heading', { name: 'Earlier shops on this plot' }), 'the old shop is under History').toBeVisible();
  await card.getByRole('tab', { name: 'Comments' }).click();

  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await form.getByRole('button', { name: 'The plot is now empty' }).click();
  await form.getByRole('button', { name: 'Force edit' }).click();
  await expect(card.locator('h2')).toContainText('Vacant plot');
  expect(currentShop('corridors-7')).toBeUndefined();
  await expect(card.getByRole('button', { name: 'Add shop' }), 'focused, now that it is empty').toBeFocused();
  expect(lastRevision()).toMatchObject({ action: 'vacate', direct: 1, status: 'approved' });
  await expectNoProblems(page);
});
