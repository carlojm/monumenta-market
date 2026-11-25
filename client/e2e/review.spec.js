// Reviewing suggestions (3.5): approve and reject on the card (owners,
// mods) and in Admin → Needs review (mods).

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, edit, expectNoProblems, pageAs, readDb, serverForFile } from './helpers.js';

const server = serverForFile();
const query = (sql, ...args) => { const db = readDb(server); try { return db.prepare(sql).get(...args); } finally { db.close(); } };
const shopOn = (plot) => query('SELECT * FROM shops WHERE plot_id = ? AND closed_at IS NULL', plot);
const revision = (id) => query('SELECT r.*, a.name AS reviewer FROM revisions r LEFT JOIN accounts a ON a.id = r.reviewer_id WHERE r.id = ?', id);
const suggest = async (name, plot, changes, summary) => (await edit(server.as, name, plot, changes, { summary })).body.id;
// The focused element's name: its aria-label (icon buttons like Edit), or its text.
const focused = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return (a?.getAttribute('aria-label') ?? a?.textContent)?.trim().slice(0, 40);
});
async function openPending(page) {
  const pending = page.locator('.pending-edits');
  await pending.getByRole('button', { name: 'Show' }).click();
  return pending;
}

let page;

test('the owner approves on the card', async ({ browser }) => {
  const id = await suggest('Tester', 'corridors-2', { palette: 'Suggested palette' }, 'palette is wrong');
  page = await pageAs(browser, server, 'ShopOwner', PHONE);
  await page.goto('/plot/corridors-2');
  const item = (await openPending(page)).locator('.pending-edits__list > li').first();
  await expect(item.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  await expect(item.getByRole('button', { name: 'Reject' })).toBeVisible();
  await item.getByRole('button', { name: 'Approve', exact: true }).click();
  const notice = page.locator('dialog .plot-detail__notice');
  await expect(notice).toContainText('Edit approved.');
  await expect(notice.getByRole('button', { name: 'Undo' }), 'no Undo after approving').toHaveCount(0);
  await expect(page.locator('[role="status"].visually-hidden')).toHaveText('Edit approved.');
  await expect(page.locator('.plot-detail__meta')).toContainText('Suggested palette');
  await expect(page.locator('.pending-edits'), 'the waiting line is gone').toHaveCount(0);
  expect(await focused(page), 'focus on Edit').toBe('Edit');
  expect(shopOn('corridors-2').palette).toBe('Suggested palette');
  expect(revision(id)).toMatchObject({ status: 'approved', reviewer: 'ShopOwner' });
});

test('the owner rejects with a reason', async () => {
  const id = await suggest('Tester', 'corridors-2', { palette: 'Bad idea' });
  await page.reload();
  const item = (await openPending(page)).locator('.pending-edits__list > li').first();
  await item.getByRole('button', { name: 'Reject' }).click();
  await expect(item.getByLabel('Reason (optional)'), 'asks for a reason, focused').toBeFocused();
  await item.getByRole('button', { name: 'Cancel' }).click();
  await expect(item.getByRole('button', { name: 'Approve', exact: true }), 'Cancel goes back').toBeVisible();
  await item.getByRole('button', { name: 'Reject' }).click();
  await item.getByLabel('Reason (optional)').fill('not accurate');
  await item.getByRole('button', { name: 'Reject' }).click();
  await expect(page.locator('dialog .plot-detail__notice')).toContainText('Edit rejected.');
  expect(revision(id)).toMatchObject({ status: 'rejected', review_note: 'not accurate', reviewer: 'ShopOwner' });
  expect(shopOn('corridors-2').palette, 'the page is unchanged').toBe('Suggested palette');
});

test("the owner sees, but can't approve, closing their shop", async () => {
  const { id } = (await server.as('Tester').post('/api/plots/corridors-2/revisions', { action: 'vacate', summary: 'gone?' })).body;
  await page.reload();
  const pending = await openPending(page);
  await expect(pending.locator('li')).toHaveCount(1);
  await expect(pending.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await server.as('Tester').post(`/api/revisions/${id}/withdraw`);
});

test('approving after the page changed: choose a version', async () => {
  await suggest('Player2', 'corridors-2', { description: 'Player2 about', stock: 'Player2 stock' });
  await edit(server.as, 'ShopOwner', 'corridors-2', { description: 'Owner about' });
  await page.reload();
  const item = (await openPending(page)).locator('.pending-edits__list > li').first();
  await item.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(item.getByText('The page changed since this was suggested.')).toBeVisible();
  await expect(item.locator('fieldset legend'), 'only About clashes').toHaveText(['About']);
  await expect(item.getByRole('radio', { name: /Suggested/ })).toBeVisible();
  await item.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(item.getByRole('alert')).toHaveText('Choose a version for each field first.');
  await item.getByRole('radio', { name: /Current/ }).check();
  await item.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.locator('dialog .plot-detail__notice')).toContainText('Edit approved.');
  expect(shopOn('corridors-2')).toMatchObject({ description: 'Owner about', stock: 'Player2 stock' });
  await expectNoProblems(page);
  await page.context().close();
});

test('a suggestion for an earlier shop can only be rejected', async ({ browser }) => {
  await suggest('Player2', 'corridors-7', { palette: 'For the old shop' });
  await server.as('ModTester').post('/api/plots/corridors-7/revisions', { action: 'open', proposed: { owner: 'Takeover' } });
  const mod = await pageAs(browser, server, 'ModTester', PHONE);
  await mod.goto('/plot/corridors-7');
  const item = (await openPending(mod)).locator('.pending-edits__list > li').first();
  await expect(item.getByText('Made for an earlier shop on this plot.')).toBeVisible();
  await expect(item.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await expect(item.getByRole('button', { name: 'Reject' })).toBeVisible();
  await mod.context().close();
});

test('players get no review buttons, and no Needs review', async ({ browser }) => {
  await suggest('Player2', 'corridors-3', { palette: 'Player2 palette' }, 'checked in game');
  await suggest('Player2', 'corridors-1', { palette: 'Player2 nonsense' });
  const player = await pageAs(browser, server, 'Tester', PHONE);
  await player.goto('/plot/corridors-3');
  const pending = await openPending(player);
  await expect(pending.locator('li')).toHaveCount(1);
  await expect(pending.getByRole('button', { name: /Approve|Reject/ })).toHaveCount(0);
  await player.goto('/admin');
  await expect(player.getByText("You don't have access to this page.")).toBeVisible();
  await expect(player.getByRole('button', { name: /^Needs review/ })).toHaveCount(0);
  await player.context().close();
});

test('moderators: the Needs review tab', async ({ browser }) => {
  page = await pageAs(browser, server, 'ModTester', DESKTOP);
  await page.goto('/admin');
  const tab = page.getByRole('button', { name: /^Needs review/ });
  await expect(page.locator('.admin-page__tabs button').first()).toContainText('Needs review');
  await expect(tab).toHaveAttribute('aria-pressed', 'true');
  const queued = query("SELECT count(*) AS n FROM revisions WHERE status = 'pending'").n;
  await expect(tab, 'the tab shows the count').toContainText(`(${queued})`);

  const entry = page.locator('.admin-review__item').filter({ hasText: 'checked in game' });
  const s3 = shopOn('corridors-3');
  await expect(entry.getByRole('link', { name: s3.shop_name || s3.owner })).toHaveAttribute('href', '/plot/corridors-3');
  await expect(entry).toContainText('by Player2');
  await expect(entry).toContainText('“checked in game”');
  await entry.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.locator('.admin-review__status')).toHaveText("Approved: Player2's edit to corridors-3.");
  await expect(entry).toHaveCount(0);
  await expect(tab).toContainText(`(${queued - 1})`);
  expect(await focused(page), 'focus on the heading').toBe('Needs review');
  expect(shopOn('corridors-3').palette).toBe('Player2 palette');

  const bad = page.locator('.admin-review__item').filter({ hasText: 'nonsense' });
  await bad.getByRole('button', { name: 'Reject' }).click();
  await bad.getByLabel('Reason (optional)').fill('spam');
  await bad.getByRole('button', { name: 'Reject' }).click();
  await expect(page.locator('.admin-review__status')).toHaveText(/^Rejected/);
  expect(query("SELECT status, review_note FROM revisions WHERE review_note = 'spam'")).toMatchObject({ status: 'rejected' });
});

test('Refresh picks up new suggestions, and the list survives switching tabs', async () => {
  await suggest('Tester', 'corridors-3', { palette: 'Late arrival' });
  await page.getByRole('button', { name: 'Refresh' }).click();
  const late = page.locator('.admin-review__item').filter({ hasText: 'Late arrival' });
  await expect(late).toBeVisible();
  await page.getByRole('button', { name: 'Plots' }).click();
  await page.getByRole('button', { name: /^Needs review/ }).click();
  await expect(late).toBeVisible();
  await expectNoProblems(page);
});
