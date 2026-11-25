// Starred shops (4.7): starred from the card, kept in this browser, pinned
// to the top of the list with a star (to unstar), and an "Only starred
// shops" filter.

import { expect, test } from '@playwright/test';
import { DESKTOP, expectNoProblems, pageAs, serverForFile } from './helpers.js';

const server = serverForFile();
let page;
let lastId; // starred in the first test
const rows = () => page.locator('.plot-table__open');
const rowStar = (id) => page.locator('tr').filter({ has: page.locator(`.plot-table__open[data-plot-id="${id}"]`) }).locator('.star-button');

test('starring a shop on its card pins its row to the top, and it stays after a reload', async ({ browser }) => {
  page = await pageAs(browser, server, null, DESKTOP);
  await page.goto('/');
  await expect(rows()).toHaveCount(168);
  await expect(page.locator('.plot-table .star-button'), 'no stars until something is starred').toHaveCount(0);
  // The last shop in the list (vacant plots come after the shops).
  lastId = await page.locator('tr:not(.plot-table__row--vacant) .plot-table__open').last().getAttribute('data-plot-id');
  await page.goto(`/plot/${lastId}`);
  await page.locator('.plot-detail__header .star-button').click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(rows().first(), 'pinned to the top').toHaveAttribute('data-plot-id', lastId);
  await expect(rowStar(lastId)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.plot-table .star-button'), 'only on the starred row').toHaveCount(1);
  await page.reload();
  await expect(rows().first(), 'kept in this browser').toHaveAttribute('data-plot-id', lastId);
  await expectNoProblems(page);
});

test('the card has the same star, and the keyboard works it', async () => {
  await page.goto('/plot/corridors-2');
  const cardStar = page.locator('.plot-detail__header .star-button');
  await expect(cardStar).toHaveAttribute('aria-pressed', 'false');
  await cardStar.focus();
  await page.keyboard.press('Enter');
  await expect(cardStar).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(cardStar).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');
  await expect(cardStar).toHaveAttribute('aria-pressed', 'true');
  await expectNoProblems(page);
});

test('"Only starred shops" shows just the starred ones', async () => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: /Only starred shops/ }).click();
  await expect(page.locator('.filters__chip')).toHaveCount(1);
  await expect(rows()).toHaveCount(2);
  await rowStar('corridors-2').click();
  await expect(rows(), 'unstarring removes it').toHaveCount(1);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /Only starred shops/ }), 'one at a time').toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Remove filter Only starred shops' }).click();
  await expect(rowStar('corridors-2'), 'and its star').toHaveCount(0);
  // Unstarring in the full list: the star goes, and focus moves to the name.
  await rowStar(lastId).click();
  await expect(rowStar(lastId)).toHaveCount(0);
  await expect(page.locator(`.plot-table__open[data-plot-id="${lastId}"]`), 'focus goes to its name').toBeFocused();
  await expectNoProblems(page);
});

test('vacant plots have no star', async () => {
  const vacant = page.locator('.plot-table__row--vacant').first();
  await expect(vacant).toBeVisible();
  await expect(vacant.locator('.star-button')).toHaveCount(0);
  await expectNoProblems(page);
});
