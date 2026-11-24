// Desktop scrolling (4.17): the header stays, and each column scrolls on its
// own. Scrolling over the list moves only the table; over a long card, only
// the card; with a card open, the left column (map, search, whole list)
// scrolls as one.

import { expect, test } from '@playwright/test';
import { expectNoProblems, pageAs, serverForFile } from './helpers.js';

const server = serverForFile();
const LAPTOP = { viewport: { width: 1366, height: 800 } };
const scrollTops = (page) => page.evaluate(() => ({
  window: window.scrollY,
  rows: document.querySelector('.app-main__list .app-main__rows')?.scrollTop ?? null,
  left: document.querySelector('.app-main__map')?.scrollTop ?? null,
  right: document.querySelector('.app-main__list')?.scrollTop ?? null,
}));
async function wheelOver(page, locator, dy = 1200) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300));
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, dy / 4);
  await page.waitForTimeout(400);
}

test('no card: the wheel over the list scrolls only the table', async ({ browser }) => {
  const page = await pageAs(browser, server, null, LAPTOP);
  await page.goto('/');
  await expect(page.locator('.plot-table__open').first()).toBeVisible();
  const search = page.getByPlaceholder('Search shops, owners, comments...');
  const searchTop = (await search.boundingBox()).y;
  await wheelOver(page, page.locator('.app-main__rows'));
  const after = await scrollTops(page);
  expect(after.window, 'the page itself never scrolls').toBe(0);
  expect(after.rows, 'the table did').toBeGreaterThan(300);
  expect((await search.boundingBox()).y, 'the search stays put').toBe(searchTop);
  await expect(page.locator('.navbar')).toBeInViewport();
  const head = await page.locator('.plot-table thead th').first().boundingBox();
  const rowsBox = await page.locator('.app-main__rows').boundingBox();
  expect(Math.abs(head.y - rowsBox.y), 'the column headers stay at the top of the table').toBeLessThan(2);

  // At the end of the table, more scrolling doesn't spill into the page.
  await wheelOver(page, page.locator('.app-main__rows'), 40000);
  expect((await scrollTops(page)).window).toBe(0);
  await expectNoProblems(page);
});

test('a long card scrolls in its own pane; the left column scrolls as one', async ({ browser }) => {
  // A long card: many comments.
  for (let i = 0; i < 25; i++) await server.as('Tester').post('/api/plots/corridors-1/comments', { body: `Comment ${i} with enough text to take some room on the card.` });
  const page = await pageAs(browser, server, null, LAPTOP);
  await page.goto('/');
  await page.locator('.plot-table__open[data-plot-id="corridors-1"]').click();
  const card = page.locator('section.plot-detail__sheet--inline');
  await expect(card).toBeVisible();
  await wheelOver(page, card);
  let tops = await scrollTops(page);
  expect(tops.window, 'not the page').toBe(0);
  expect(tops.right, 'the card pane scrolled').toBeGreaterThan(300);
  expect(tops.left, 'the left column did not').toBe(0);
  await expect(page.locator('.navbar')).toBeInViewport();

  // The left column: map, then search, then the whole list.
  const rows = page.locator('.app-main__map .plot-table__open');
  await expect(rows).toHaveCount(168);
  await wheelOver(page, page.locator('.app-main__map .market-map'));
  tops = await scrollTops(page);
  expect(tops.left, 'the left column scrolled').toBeGreaterThan(300);
  expect(tops.window).toBe(0);
  const search = await page.locator('.app-main__map .app-main__search').boundingBox();
  const column = await page.locator('.app-main__map').boundingBox();
  expect(Math.abs(search.y - column.y), 'the search sticks to the top of the column').toBeLessThan(2);

  // Back to the list: the table is where it was, with focus on the row.
  await page.getByRole('button', { name: /Back to list/ }).click();
  await expect(page.locator('.app-main__list .plot-table__open[data-plot-id="corridors-1"]')).toBeFocused();
  await expectNoProblems(page);
});
