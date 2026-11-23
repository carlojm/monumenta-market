// Undo right after a Force edit (3.3e): an owner's edit, a mod's new shop
// and closure. Only while nothing has changed the page since.

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, edit, expectNoProblems, pageAs, readDb, serverForFile } from './helpers.js';

const server = serverForFile();
const query = (sql, ...args) => { const db = readDb(server); try { return db.prepare(sql).get(...args); } finally { db.close(); } };
const all = (sql, ...args) => { const db = readDb(server); try { return db.prepare(sql).all(...args); } finally { db.close(); } };
const current = (plot) => query('SELECT * FROM shops WHERE plot_id = ? AND closed_at IS NULL', plot);
const tagsOf = (id) => all('SELECT tag_id FROM shop_tags WHERE shop_id = ? ORDER BY tag_id', id).map((r) => r.tag_id);
const lastRevision = () => query('SELECT * FROM revisions ORDER BY id DESC LIMIT 1');
const tb = (form, name) => form.getByRole('textbox', { name, exact: true });
let page, card, form;
const notice = () => card.locator('.plot-detail__notice');

async function open(browser, name, plot, options) {
  page = await pageAs(browser, server, name, options);
  await page.goto(`/plot/${plot}`);
  card = page.locator('dialog, section.plot-detail__sheet').first();
  form = card.locator('form.shop-edit');
}

test.beforeAll(async () => {
  const { tags } = (await server.as(null).get('/api/tags')).body;
  await edit(server.as, 'ModTester', 'corridors-2', { tag_ids: [tags[0].id, tags[1].id] });
});

test("the owner undoes an edit", async ({ browser }) => {
  const before = current('corridors-2');
  const beforeTags = tagsOf(before.id);
  const firstTag = query('SELECT name FROM tags WHERE id = ?', beforeTags[0]).name;
  await open(browser, 'ShopOwner', 'corridors-2', DESKTOP);
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await tb(form, 'About').fill('Undo me');
  await form.getByRole('button', { name: `Remove ${firstTag}` }).click();
  await form.getByRole('button', { name: 'Force edit' }).click();
  await expect(notice()).toContainText('Edit saved.');
  await expect(card.locator('.plot-detail__text')).toContainText('Undo me');
  const saved = lastRevision();
  await notice().getByRole('button', { name: 'Undo' }).click();
  await expect(notice()).toContainText('Edit undone.');
  await expect(page.locator('[role="status"].visually-hidden')).toHaveText('Edit undone.');
  await expect(card.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
  const after = current('corridors-2');
  expect(after.description).toBe(before.description);
  expect(tagsOf(after.id), 'the removed tag is back').toEqual(beforeTags);
  await expect(card.locator('.plot-detail__text')).not.toContainText('Undo me');
  const r = lastRevision();
  expect(r).toMatchObject({ id: saved.id + 1, direct: 1, action: 'edit', summary: `Undo of #${saved.id}` });
  expect(query('SELECT 1 AS yes FROM comments WHERE shop_id = ? AND is_system = 1 AND body LIKE ?', after.id, `%(undo of #${saved.id})%`)).toBeTruthy();

  expect((await server.as('ShopOwner').post(`/api/revisions/${saved.id}/undo`)).status, 'twice: refused').toBe(409);
  expect((await server.as('Tester').post(`/api/revisions/${r.id}/undo`)).status, "someone else's").toBe(404);
});

test("after someone else's edit, Undo explains it can't", async () => {
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await tb(form, 'Palette').fill('Owner palette');
  await form.getByRole('button', { name: 'Force edit' }).click();
  await expect(notice()).toContainText('Edit saved.');
  await edit(server.as, 'ModTester', 'corridors-2', { stock: 'Mod stock' });
  await notice().getByRole('button', { name: 'Undo' }).click();
  await expect(notice().getByRole('alert')).toContainText('can no longer be undone');
  await expect(notice().getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
  expect(current('corridors-2')).toMatchObject({ palette: 'Owner palette', stock: 'Mod stock' });
  await expect(card.locator('.plot-detail__meta'), 'the card reloads').toContainText('Mod stock');
  await expectNoProblems(page, { statuses: [409] });
  await page.context().close();

  const { id } = (await server.as('Tester').post('/api/plots/corridors-1/revisions', { action: 'vacate' })).body;
  expect((await server.as('Tester').post(`/api/revisions/${id}/undo`)).status, 'a suggestion has no undo').toBe(404);
});

test('a moderator undoes "A new shop is here"', async ({ browser }) => {
  const old = current('corridors-7');
  const comments = () => query('SELECT count(*) AS n FROM comments WHERE shop_id = ? AND is_system = 0', old.id).n;
  const before = comments();
  await open(browser, 'ModTester', 'corridors-7', PHONE);
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await form.getByRole('button', { name: 'A new shop is here' }).click();
  await tb(form, 'Owner').fill('Temp');
  await form.getByRole('button', { name: 'Force edit' }).click();
  await expect(notice()).toContainText('Edit saved.');
  const opened = current('corridors-7');
  expect(opened.id).not.toBe(old.id);
  await notice().getByRole('button', { name: 'Undo' }).click();
  await expect(notice()).toContainText('Edit undone.');
  expect(current('corridors-7').id, 'the same shop row is back').toBe(old.id);
  expect(comments(), 'with its comments').toBe(before);
  expect(query('SELECT closed_at FROM shops WHERE id = ?', opened.id).closed_at).toBeTruthy();
  await expect(card.locator('h2')).toContainText(old.shop_name || old.owner);
});

test('a moderator undoes "The plot is now empty"', async () => {
  const old = current('corridors-7');
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await form.getByRole('button', { name: 'The plot is now empty' }).click();
  await form.getByRole('button', { name: 'Force edit' }).click();
  await expect(card.locator('h2')).toContainText('Vacant plot');
  expect(current('corridors-7')).toBeUndefined();
  await notice().getByRole('button', { name: 'Undo' }).click();
  await expect(notice()).toContainText('Edit undone.');
  expect(current('corridors-7')?.id).toBe(old.id);
  const r = lastRevision();
  expect(r.action).toBe('open');
  expect(r.summary).toMatch(/^Undo of #/);
  await expect(card.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
  await expectNoProblems(page);
});
