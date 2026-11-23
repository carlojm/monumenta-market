// A Force edit that clashes (3.3d): someone changed the same field while
// the owner was editing. They choose a version; everything else merges.

import { expect, test } from '@playwright/test';
import { PHONE, edit, expectNoProblems, pageAs, readDb, serverForFile, snapshot } from './helpers.js';

const server = serverForFile();
const P = 'corridors-2'; // ShopOwner's
const query = (sql, ...args) => { const db = readDb(server); try { return db.prepare(sql).get(...args); } finally { db.close(); } };
const shop = () => query('SELECT * FROM shops WHERE plot_id = ? AND closed_at IS NULL', P);
const lastRevision = () => query('SELECT * FROM revisions ORDER BY id DESC LIMIT 1');
const modEdits = (changes) => edit(server.as, 'ModTester', P, changes);
const tb = (form, name) => form.getByRole('textbox', { name, exact: true });
let tags;

test.beforeAll(async () => {
  tags = (await server.as(null).get('/api/tags')).body.tags;
  await modEdits({ tag_ids: [tags[0].id, tags[1].id] });
});

async function ownerForm(browser) {
  const page = await pageAs(browser, server, 'ShopOwner', PHONE);
  await page.goto(`/plot/${P}`);
  await page.locator('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
  return { page, form: page.locator('form.shop-edit') };
}

test('a clash on About; the other changes merge', async ({ browser }) => {
  const { page, form } = await ownerForm(browser);
  const start = (await snapshot(server.as, P)).tag_ids;
  const removed = tags.find((t) => t.id === start[0]);
  await tb(form, 'About').fill('Owner about');
  await tb(form, 'Palette').fill('Owner palette');
  await form.getByRole('button', { name: `Remove ${removed.name}` }).click();

  // Meanwhile a mod changes About (a clash), Keywords (none) and adds a tag.
  const added = tags.find((t) => !start.includes(t.id));
  await modEdits({ description: 'Mod about', stock: 'Mod keywords', tag_ids: [...start, added.id] });

  await form.getByRole('button', { name: 'Force edit' }).click();
  const why = form.getByText('Someone changed this page while you were editing.');
  await expect(why).toBeVisible();
  await expect(why, 'focus moves to the explanation').toBeFocused();
  await expect(form.locator('fieldset legend'), 'only About clashes').toHaveText(['About']);
  await expect(form.getByText('Owner about')).toBeVisible();
  await expect(form.getByText('Mod about')).toBeVisible();
  await expect(tb(form, 'Palette'), 'the fields are hidden').toHaveCount(0);
  await expect(form.getByText('Not the same shop anymore?')).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Show changes' })).toHaveCount(0);
  expect(await form.locator('.shop-edit__choice').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height >= 36)),
    'each choice is 36px+').toBe(true);

  await form.getByRole('button', { name: 'Force edit' }).click();
  await expect(form.getByRole('alert')).toHaveText('Choose a version for each field first.');
  await form.getByRole('radio', { name: /Yours/ }).check();
  await expect(form.getByRole('alert')).toHaveCount(0);
  await form.getByRole('button', { name: 'Force edit' }).click();
  await expect(page.locator('.plot-detail__notice')).toContainText('Edit saved.');

  expect(shop()).toMatchObject({ description: 'Owner about', palette: 'Owner palette', stock: 'Mod keywords' });
  const now = (await snapshot(server.as, P)).tag_ids;
  expect(now.includes(removed.id) || !now.includes(added.id), 'your removal and their addition both kept').toBe(false);
  const r = lastRevision();
  expect(r.direct).toBe(1);
  expect(JSON.parse(r.base).description, 'based on the current page').toBe('Mod about');
  const logged = query("SELECT data FROM mod_log WHERE revision_id = ? AND action = 'revision.publish'", r.id);
  expect(JSON.parse(logged.data).resolved).toEqual([{ field: 'description', kept: 'mine' }]);
  await expectNoProblems(page, { statuses: [409] });
  await page.context().close();
});

test('choosing Current for your only change leaves nothing to save', async ({ browser }) => {
  const { page, form } = await ownerForm(browser);
  await tb(form, 'About').fill('Owner again');
  await modEdits({ description: 'Mod again' });
  await form.getByRole('button', { name: 'Force edit' }).click();
  await form.getByRole('radio', { name: /Current/ }).check();
  const before = lastRevision().id;
  await form.getByRole('button', { name: 'Force edit' }).click();
  await expect(form.getByRole('alert')).toHaveText('Nothing left to save: the page already has these changes.');
  expect(lastRevision().id, 'nothing sent').toBe(before);
  await expect(tb(form, 'About')).toHaveValue('Mod again');
  await expect(form.getByRole('button', { name: 'Undo changes to About' }), 'not marked edited').toHaveCount(0);
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('form.shop-edit'), 'closes without asking').toHaveCount(0);
  await page.context().close();
});

test('Suggest edit from the chooser', async ({ browser }) => {
  const { page, form } = await ownerForm(browser);
  await tb(form, 'About').fill('Owner third');
  await modEdits({ description: 'Mod third' });
  await form.getByRole('button', { name: 'Force edit' }).click();
  await form.getByRole('radio', { name: /Yours/ }).check();
  await form.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(page.locator('.plot-detail__notice')).toContainText('Sent for review');
  const r = lastRevision();
  expect(r.status).toBe('pending');
  expect(JSON.parse(r.base).description).toBe('Mod third');
  expect(JSON.parse(r.proposed).description).toBe('Owner third');
  expect(shop().description, 'the page keeps the mod\'s text').toBe('Mod third');
  await page.context().close();
});
