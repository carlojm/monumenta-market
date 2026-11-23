// Suggestions waiting for review, on the card (3.6): public, collapsed to
// one line, your own can be withdrawn, hidden while editing.

import { expect, test } from '@playwright/test';
import { PHONE, expectNoProblems, pageAs, serverForFile, snapshot } from './helpers.js';

const server = serverForFile();
const PLOT = 'corridors-1';
let page;
const card = () => page.locator('dialog');
const pending = () => page.locator('.pending-edits');
const line = () => pending().locator('.pending-edits__bar span');

test('a quiet card shows nothing', async ({ browser }) => {
  page = await pageAs(browser, server, 'Tester', PHONE);
  await page.goto(`/plot/${PLOT}`);
  await expect(card().getByRole('heading', { level: 2 })).toBeVisible();
  await expect(pending()).toHaveCount(0);
});

test('your suggestion shows, and survives a reload', async () => {
  const { tags } = (await server.as(null).get('/api/tags')).body;
  const own = (await snapshot(server.as, PLOT)).tag_ids;
  const tag = tags.find((t) => !own.includes(t.id)).name;
  await card().getByRole('button', { name: 'Edit', exact: true }).click();
  const form = card().locator('form.shop-edit');
  const about = form.getByRole('textbox', { name: 'About', exact: true });
  await about.fill(`${await about.inputValue()} Also sells slime.`);
  await form.getByPlaceholder('Find a tag').fill(tag);
  await form.locator('.tag-picker__option', { hasText: tag }).first().click();
  await form.getByLabel('What did you change?').fill('new stock');
  await form.getByRole('button', { name: 'Suggest edit' }).click();
  await expect(card().locator('.plot-detail__notice')).toContainText('Sent for review.');
  await expect(line()).toHaveText('Your edit is waiting for review');
  await page.reload();
  await expect(line(), 'after a reload').toHaveText('Your edit is waiting for review');

  const show = pending().getByRole('button', { name: 'Show' });
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  await expect(pending().locator('.pending-edits__list')).toHaveCount(0);
  await show.click();
  await expect(pending().getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true');
  const item = pending().locator('.pending-edits__list > li').first();
  await expect(item.locator('.pending-edits__head')).toHaveText('Edit by you just now');
  await expect(item.locator('.pending-edits__summary')).toHaveText('“new stock”');
  await expect(item.locator('ins').first()).toContainText('Also sells slime.');
  await expect(item).toContainText(`Added ${tag}`);
  await expect(item.getByRole('button', { name: 'Withdraw' })).toBeVisible();
});

test('everyone sees it, logged out too', async ({ browser }) => {
  const other = await pageAs(browser, server, null, PHONE);
  await other.goto(`/plot/${PLOT}`);
  const list = other.locator('.pending-edits');
  await expect(list.locator('.pending-edits__bar span')).toHaveText('1 edit waiting for review');
  await list.getByRole('button', { name: 'Show' }).click();
  await expect(list).toContainText('by Tester');
  await expect(list.locator('ins').first()).toBeVisible();
  await expect(list.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
  await other.context().close();
});

test('several, of each kind, oldest first', async () => {
  await server.as('ModTester').post(`/api/plots/${PLOT}/revisions`, { action: 'vacate', summary: 'looked empty', request_review: true });
  await server.as('ShopOwner').post(`/api/plots/${PLOT}/revisions`, { action: 'open', proposed: { owner: 'Newcomer', description: 'Fresh start' }, request_review: true });
  await page.reload();
  await expect(line()).toHaveText('3 edits waiting for review, including yours');
  await pending().getByRole('button', { name: 'Show' }).click();
  await expect(pending().locator('.pending-edits__head strong')).toHaveText(['Edit', 'The plot is now empty', 'A new shop is here']);
  const open = pending().locator('.pending-edits__list > li').nth(2);
  await expect(open.locator('.pending-edits__label')).toHaveText(['Owner', 'About']);
  await expect(open).toContainText('Newcomer');
  await expect(pending().getByRole('button', { name: 'Withdraw' }), 'only your own').toHaveCount(1);
});

test('a field changed since is compared against the page as it is now', async () => {
  const base = await snapshot(server.as, PLOT);
  await server.as('ModTester').post(`/api/plots/${PLOT}/revisions`, { action: 'edit', base, proposed: { ...base, description: 'Mod rewrote it' } });
  await page.reload();
  await pending().getByRole('button', { name: 'Show' }).click();
  const mine = pending().locator('.pending-edits__list > li').first();
  await expect(mine).toContainText('About changed since this was suggested');
  await expect(mine.locator('del').first()).toContainText('Mod rewrote it');
});

test('withdraw from the list', async () => {
  await pending().locator('.pending-edits__list > li').first().getByRole('button', { name: 'Withdraw' }).click();
  await expect(card().locator('.plot-detail__notice')).toContainText('Suggestion withdrawn.');
  await expect(line()).toHaveText('2 edits waiting for review');
  await expect(card().getByRole('button', { name: 'Edit', exact: true }), 'focus on Edit').toBeFocused();
  await expect(page.locator('[role="status"].visually-hidden')).toHaveText('Suggestion withdrawn.');
});

test('hidden while editing', async () => {
  await card().getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(pending()).toHaveCount(0);
  await card().locator('form.shop-edit').getByRole('button', { name: 'Cancel' }).click();
  await expect(pending()).toBeVisible();
  await expectNoProblems(page);
});
