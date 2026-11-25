// The shop card (3.0a): a real modal dialog on phones, focus handling,
// announcements, tap targets, scrolling; an inline panel on desktop.

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, expectNoProblems, pageAs, serverForFile } from './helpers.js';

const server = serverForFile();
const focusedInfo = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return { tag: a?.tagName, text: a?.textContent?.trim().slice(0, 40), inDialog: !!a?.closest('dialog'), plotId: a?.dataset?.plotId ?? null };
});
let page, firstRow, firstId, dialog;
const closed = () => expect(page.locator('dialog')).toHaveCount(0);
const path = () => new URL(page.url()).pathname;

test('phone: the card is a modal dialog that keeps focus inside', async ({ browser }) => {
  page = await pageAs(browser, server, 'Tester', PHONE);
  await page.goto('/');
  firstRow = page.locator('.plot-table__open').first();
  firstId = await firstRow.getAttribute('data-plot-id');
  const firstName = (await firstRow.textContent()).trim();
  await firstRow.focus();
  await page.keyboard.press('Enter');
  dialog = page.getByRole('dialog', { name: firstName });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('dialog').matches(':modal')), 'modal').toBe(true);
  expect((await focusedInfo(page)).inDialog, 'focus moved inside').toBe(true);
  // Past the last button, Tab goes to the browser's own toolbar (activeElement
  // = body); it must never land on the page behind.
  let leaked = null;
  let cycled = false;
  for (let i = 0; i < 60 && !leaked; i++) {
    await page.keyboard.press('Tab');
    const info = await focusedInfo(page);
    if (info.tag === 'BODY') cycled = true;
    else if (!info.inDialog) leaked = info;
  }
  expect(leaked, 'Tab never reaches the page behind').toBeNull();
  expect(cycled, 'Tab does reach past the end and back').toBe(true);
});

test('phone: every way of closing it', async () => {
  await page.keyboard.press('Escape');
  await closed();
  expect(path()).toBe('/');
  expect((await focusedInfo(page)).plotId, 'focus returns to the row').toBe(firstId);

  await firstRow.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(195, 20); // the dimmed page above the sheet
  await closed();

  await firstRow.click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await closed();
  expect((await focusedInfo(page)).plotId, 'Back returns focus to the row').toBe(firstId);

  await firstRow.click();
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await closed();
  expect(path()).toBe('/');
});

test('phone: comments, reports and announcements', async () => {
  await firstRow.click();
  const box = dialog.getByLabel(/Add a comment/);
  await expect(box, 'a real label').toHaveCount(1);
  await box.fill('Testing the card');
  await dialog.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.locator('[role=status]').first()).toContainText('Comment posted');
  await dialog.getByRole('button', { name: 'Delete' }).first().click();
  expect((await focusedInfo(page)).text, 'Delete: focus on the safe Cancel').toBe('Cancel');
  await page.keyboard.press('Enter');
  expect((await focusedInfo(page)).text, 'Cancel: back on Delete').toBe('Delete');
  await dialog.getByRole('button', { name: 'Delete' }).first().click();
  await dialog.getByRole('button', { name: 'Yes' }).click();
  await expect(page.locator('[role=status]').first()).toContainText('Comment deleted');
  expect((await focusedInfo(page)).text, 'focus on the Comments heading').toBe('Comments');

  await dialog.locator('.plot-detail__chips button').first().click();
  await dialog.getByRole('button', { name: 'Locked', exact: true }).click();
  await dialog.locator('.plot-detail__submit').click();
  await expect(page.locator('[role=status]').first()).toContainText('Report sent');

  await page.route('**/api/plots/*/comments', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Test failure"}' }));
  await box.fill('will fail');
  await dialog.getByRole('button', { name: 'Post comment' }).click();
  await expect(dialog.getByRole('alert'), 'a failed post is read out').toContainText('Test failure');
  await page.unroute('**/api/plots/*/comments');
  const before = await box.evaluate((el) => el.offsetHeight);
  await box.fill('line\n'.repeat(12));
  expect(await box.evaluate((el) => el.offsetHeight), 'the comment box grows').toBeGreaterThan(before);
});

test('phone: tap targets', async () => {
  const small = await page.evaluate(() => [...document.querySelectorAll('dialog button, dialog summary, dialog a')]
    .filter((el) => el.offsetParent !== null)
    .map((el) => { const r = el.getBoundingClientRect(); return { label: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 24), h: r.height, w: r.width, inText: el.tagName === 'A' && !!el.closest('p') }; })
    .filter((t) => !t.inText && (t.h < 24 || t.w < 24)));
  expect(small, 'everything at least 24px').toEqual([]);
  const touch = await page.evaluate(() => [...document.querySelectorAll('dialog .plot-detail__chips button, dialog .plot-detail__comment-actions button, dialog .tag-chip--add, dialog summary')]
    .filter((el) => el.offsetParent !== null).map((el) => Math.round(el.getBoundingClientRect().height)));
  expect(touch.length > 0 && touch.every((h) => h >= 36), `chips, votes, + and toggles are 36px: ${touch}`).toBe(true);
  await expectNoProblems(page, { statuses: [500] }); // the failed post above, on purpose
  await page.context().close();
});

test('a narrow desktop window: centered, and scrolling stays in the card', async ({ browser }) => {
  const m = await pageAs(browser, server, null, { viewport: { width: 800, height: 700 } });
  await m.goto('/');
  await m.locator('.plot-table__open').first().click();
  await expect(m.locator('dialog')).toBeVisible();
  const y0 = await m.evaluate(() => scrollY);
  await m.mouse.move(400, 400);
  for (let i = 0; i < 15; i++) await m.mouse.wheel(0, 600);
  await m.waitForTimeout(300);
  expect(await m.evaluate(() => scrollY), 'the page behind never scrolls').toBe(y0);
  expect(await m.evaluate(() => document.querySelector('dialog').scrollTop > 0), 'the card did').toBe(true);
  expect(await m.evaluate(() => { const r = document.querySelector('dialog').getBoundingClientRect(); return r.bottom < innerHeight - 5 && r.width <= 482; }),
    'centered, not a bottom sheet').toBe(true);
  await m.context().close();
});

test('desktop: an inline card, with focus handled', async ({ browser }) => {
  const d = await pageAs(browser, server, null, DESKTOP);
  await d.goto('/');
  const row = d.locator('.plot-table__open').nth(3);
  const rowId = await row.getAttribute('data-plot-id');
  await row.focus();
  await d.keyboard.press('Enter');
  await expect(d.getByRole('heading', { level: 2 })).toBeVisible();
  expect((await focusedInfo(d)).tag, 'focus on the title').toBe('H2');
  await expect(d.locator('dialog'), 'not a dialog').toHaveCount(0);
  await d.getByRole('button', { name: 'Close' }).focus();
  await d.keyboard.press('Enter');
  await expect.poll(async () => (await focusedInfo(d)).plotId, 'Close returns focus to the row').toBe(rowId);
  await d.locator('.plot-table__open').nth(5).click();
  await expect(d.getByRole('heading', { level: 2 })).toBeVisible();
  expect(await d.evaluate(() => document.activeElement.matches(':focus-visible')), 'no focus ring after a mouse click').toBe(false);
  const small = await d.evaluate(() => [...document.querySelectorAll('.plot-detail__sheet button, .plot-detail__sheet summary')]
    .filter((el) => el.offsetParent !== null).map((el) => ({ label: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 20), h: el.getBoundingClientRect().height }))
    .filter((t) => t.h < 24));
  expect(small, 'everything at least 24px').toEqual([]);
  await expectNoProblems(d);
});
