// Maintainers on the site (3.8): shown on the card, set in the edit form by
// the owner, and a maintainer's form follows the server's rule: they publish
// directly, except a change to who the maintainers are.

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, edit, expectNoProblems, pageAs, readDb, serverForFile } from './helpers.js';

const server = serverForFile();
const P = 'corridors-2'; // ShopOwner's
const G = 'eastguild-1'; // FISH, a guild shop
const query = (sql, ...args) => { const db = readDb(server); try { return db.prepare(sql).get(...args); } finally { db.close(); } };
const shopOn = (plot) => query('SELECT * FROM shops WHERE plot_id = ? AND closed_at IS NULL', plot);
const textbox = (form, name) => form.getByRole('textbox', { name, exact: true });
const row = (card, label) => card.locator('.plot-detail__meta dt').filter({ hasText: new RegExp(`^${label}$`) });

async function openForm(browser, name, plot, options = PHONE) {
  const page = await pageAs(browser, server, name, options);
  await page.goto(`/plot/${plot}`);
  const card = page.locator('dialog, section.plot-detail__sheet').first();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  return { page, card, form: card.locator('form.shop-edit') };
}

test('no maintainers: no row on the card', async ({ browser }) => {
  const page = await pageAs(browser, server, null, PHONE);
  await page.goto(`/plot/${P}`);
  await expect(row(page.locator('dialog'), 'Owner')).toBeVisible();
  await expect(row(page.locator('dialog'), 'Maintainers')).toHaveCount(0);
  await page.context().close();
});

test('the owner adds maintainers, and the card lists them', async ({ browser }) => {
  const { page, card, form } = await openForm(browser, 'ShopOwner', P);
  const field = textbox(form, 'Maintainers');
  await expect(field, 'right after Owner').toBeVisible();
  await expect(form.getByText('They can edit this page without review.')).toBeVisible();
  await field.fill('Tester,  tester Nobody_1');
  await expect(form.getByRole('button', { name: 'Force edit' }), 'the owner publishes').toBeVisible();
  await form.getByRole('button', { name: 'Force edit' }).click();
  await expect(card.locator('.plot-detail__notice')).toContainText('Edit saved.');
  expect(shopOn(P).maintainers, 'tidied by the server').toBe('Tester, Nobody_1');
  await expect(row(card, 'Maintainers').locator('xpath=following-sibling::dd[1]')).toHaveText('Tester, Nobody_1');
  await expectNoProblems(page);
  await page.context().close();
});

test('a bad name is explained', async ({ browser }) => {
  const { page, form } = await openForm(browser, 'ShopOwner', P);
  await textbox(form, 'Maintainers').fill('Tester, not-a-name');
  await form.getByRole('button', { name: 'Force edit' }).click();
  await expect(form.getByRole('alert')).toHaveText('"not-a-name" isn\'t a Minecraft name.');
  await expectNoProblems(page, { statuses: [400] });
  await page.context().close();
});

test('a maintainer edits directly', async ({ browser }) => {
  const { page, card, form } = await openForm(browser, 'Tester', P);
  await expect(form.locator('h3')).toHaveText('Editing');
  await expect(form.getByText('reviews it before it shows')).toHaveCount(0);
  await textbox(form, 'Palette').fill('Maintainer palette');
  await form.getByRole('button', { name: 'Force edit' }).click();
  await expect(card.locator('.plot-detail__notice')).toContainText('Edit saved.');
  expect(shopOn(P).palette).toBe('Maintainer palette');
  await expectNoProblems(page);
  await page.context().close();
});

test("changing the maintainers turns a maintainer's edit into a suggestion", async ({ browser }) => {
  const { page, card, form } = await openForm(browser, 'Tester', P);
  const field = textbox(form, 'Maintainers');
  await field.fill('Tester, Nobody_1, Friend');
  const note = form.getByText('Only the owner or a moderator can change this.');
  await expect(note).toBeVisible();
  await expect(field, 'the note is linked to the field').toHaveAttribute('aria-describedby', 'shop-edit-maintainers-hint shop-edit-maintainers-review');
  await expect(form.locator('h3')).toHaveText('Suggesting an edit');
  await expect(form.getByRole('button', { name: 'Force edit' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Undo changes to Maintainers' }).click();
  await expect(note, 'undoing brings Force edit back').toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Force edit' })).toBeVisible();

  await field.fill('Tester, Nobody_1, Friend');
  await form.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(card.locator('.plot-detail__notice')).toContainText('Sent for review');
  expect(shopOn(P).maintainers, 'unchanged until the owner approves').toBe('Tester, Nobody_1');
  await page.context().close();

  // The owner sees it, labeled, and can approve it.
  const owner = await pageAs(browser, server, 'ShopOwner', PHONE);
  await owner.goto(`/plot/${P}`);
  await owner.locator('.pending-edits').getByRole('button', { name: 'Show' }).click();
  const item = owner.locator('.pending-edits__list > li').first();
  await expect(item.locator('.pending-edits__label')).toHaveText(['Maintainers']);
  await item.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(owner.locator('dialog .plot-detail__notice')).toContainText('Edit approved.');
  expect(shopOn(P).maintainers).toBe('Tester, Nobody_1, Friend');
  await expectNoProblems(owner);
  await owner.context().close();
});

test('a player only suggests, and the field is there for them too', async ({ browser }) => {
  const { page, form } = await openForm(browser, 'Player2', P);
  await expect(form.locator('h3')).toHaveText('Suggesting an edit');
  await expect(textbox(form, 'Maintainers')).toHaveValue('Tester, Nobody_1, Friend');
  await expect(form.getByText('Only the owner or a moderator')).toHaveCount(0);
  await page.context().close();
});

test('a moderator sets maintainers on a guild shop in the admin editor', async ({ browser }) => {
  const page = await pageAs(browser, server, 'ModTester', DESKTOP);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Plots' }).click();
  await page.getByPlaceholder(/filter|search/i).first().fill(G);
  await page.getByRole('button', { name: new RegExp(G) }).first().click();
  const field = page.getByLabel('Maintainers (Minecraft names, separated by commas)');
  await field.fill('Player2');
  await page.getByRole('button', { name: /^Save/ }).click();
  await expect.poll(() => shopOn(G)?.maintainers).toBe('Player2');
  await page.context().close();

  // Player2 can now Force edit the guild's page.
  const r = await edit(server.as, 'Player2', G, { palette: 'Guild palette' });
  expect(r.body.status).toBe('approved');
});
