// One shop per owner (3.12): the move shown in the form, the pending card,
// the review queue, the mod log and Your edits.

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, expectNoProblems, pageAs, serverForFile } from './helpers.js';

const server = serverForFile();
const HOME = 'corridors-2'; // ShopOwner's
const NOTE = `ShopOwner already has a shop at ${HOME}. Opening this one closes it.`;
let A, B, C;

test.beforeAll(async () => {
  [A, B, C] = (await server.as(null).get('/api/plots')).body.filter((p) => !p.shop).map((p) => p.id);
});

test('the form notes the move under Owner', async ({ browser }) => {
  const page = await pageAs(browser, server, 'Tester', PHONE);
  await page.goto(`/plot/${A}`);
  await page.getByRole('button', { name: 'Add shop' }).click();
  const form = page.locator('form.shop-edit');
  const owner = form.getByRole('textbox', { name: 'Owner', exact: true });
  const note = form.locator('#shop-edit-owner-moving');
  const live = form.locator('[aria-live="polite"]');

  await owner.fill('ShopOwn');
  await expect(note, 'no note for a partial name').toHaveCount(0);
  await expect(owner).toHaveAttribute('aria-describedby', 'shop-edit-owner-hint');

  await owner.fill('shopowner');
  await expect(note, 'any case matches').toHaveText(NOTE);
  await expect(note.locator('.coord')).toHaveText(HOME);
  await expect(owner, 'the field points at the note').toHaveAttribute('aria-describedby', 'shop-edit-owner-hint shop-edit-owner-moving');
  await expect(live, 'and the live region says it').toHaveText(NOTE);
  expect(await note.evaluate((el) => el.previousElementSibling?.id), 'right under the hint').toBe('shop-edit-owner-hint');

  await owner.fill('Someone Else');
  await expect(note).toHaveCount(0);
  await expect(live).toHaveText('');
  await expect(owner).toHaveAttribute('aria-describedby', 'shop-edit-owner-hint');

  await owner.fill('ShopOwner');
  await form.getByRole('button', { name: 'Suggest edit' }).click();
  const pending = page.locator('.pending-edits');
  await pending.getByRole('button', { name: 'Show' }).click();
  await expect(pending.locator('.pending-edits__warning')).toHaveText(`ShopOwner's shop at ${HOME} closes when this is approved.`);
  await expectNoProblems(page);
});

test('the review queue shows it too', async ({ browser }) => {
  const page = await pageAs(browser, server, 'ModTester', DESKTOP);
  await page.goto('/admin');
  await page.getByRole('button', { name: /Needs review/ }).click();
  await expect(page.locator('li').filter({ hasText: `${HOME} closes when this is approved` })).toHaveCount(1);
  await expectNoProblems(page);
});

test('the mod log and Your edits', async ({ browser }) => {
  const as = server.as;
  const open = (plot) => as('ModTester').post(`/api/plots/${plot}/revisions`, { action: 'open', proposed: { owner: 'Mover', tag_ids: [] } });
  await open(B);
  const moved = (await open(C)).body;
  await as('ModTester').post(`/api/revisions/${moved.id}/undo`);

  const page = await pageAs(browser, server, 'ModTester', DESKTOP);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Mod log' }).click();
  const whats = page.locator('.modlog-entry__what');
  await expect(whats.filter({ hasText: `New shop by Mover, moved from ${B}` })).toHaveCount(1);
  await expect(whats.filter({ hasText: `and their shop at ${B} reopened` })).toHaveCount(1);

  await page.goto('/account');
  await page.getByRole('button', { name: 'Your edits' }).click();
  const entry = page.locator('.account-edit').filter({ has: page.locator(`a[href="/plot/${C}"]`) }).filter({ hasText: 'Moved from' });
  await expect(entry.locator('.account-comment__muted').filter({ hasText: 'Moved from' })).toHaveText(`Moved from ${B}`);
  await expectNoProblems(page);
});
