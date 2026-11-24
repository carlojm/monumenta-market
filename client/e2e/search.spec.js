// The main search (App): results follow the typing (useDeferredValue), the
// best matches rank first, the table and map dim what doesn't match, and
// matching tags are offered.

import { expect, test } from '@playwright/test';
import { DESKTOP, edit, expectNoProblems, pageAs, serverForFile } from './helpers.js';

const server = serverForFile();

test('typing searches; clearing shows everything again', async ({ browser }) => {
  const page = await pageAs(browser, server, null, DESKTOP);
  await page.goto('/');
  const rows = page.locator('.plot-table__open');
  await expect(rows).toHaveCount(168);
  const box = page.getByPlaceholder('Search shops, owners, comments...');
  await box.pressSequentially('slime', { delay: 30 });
  await expect(box, 'every letter shows').toHaveValue('slime');
  await expect(rows.first(), 'the best match first').toHaveAttribute('data-plot-id', 'corridors-1');
  // Search ranks and dims; it doesn't hide (filters hide).
  const dimmedRows = page.locator('.plot-table__row--dimmed');
  await expect(dimmedRows.first()).toBeVisible();
  const dimmed = await dimmedRows.count();
  expect(dimmed).toBeGreaterThan(100);
  await expect(page.locator('.market-map__plot--dimmed'), 'the map dims the same ones').toHaveCount(dimmed);
  await expect(page.locator('.plot-table__match').first(), 'with where it matched').not.toBeEmpty();
  await box.fill('');
  await expect(page.locator('.plot-table__row--dimmed')).toHaveCount(0);
  await expect(page.locator('.market-map__plot--dimmed')).toHaveCount(0);
  await expectNoProblems(page);
});

test('a matching tag is offered, and picking it filters', async ({ browser }) => {
  const page = await pageAs(browser, server, null, DESKTOP);
  await page.goto('/');
  await page.getByPlaceholder('Search shops, owners, comments...').fill('giveaway');
  const chip = page.locator('.search-tags').getByRole('button', { name: /Giveaway/ });
  await chip.click();
  await expect(page.locator('.filters__chip')).toHaveCount(1);
  await expect(page.getByPlaceholder('Search shops, owners, comments...'), 'the text is cleared').toHaveValue('');
});

test('the third column: Zone, Match while searching, About with only a tag filter', async ({ browser }) => {
  const rental = (await server.as(null).get('/api/tags')).body.tags.find((t) => t.name === 'Rental');
  await edit(server.as, 'ModTester', 'corridors-1', { tag_ids: [rental.id] });
  const page = await pageAs(browser, server, null, DESKTOP);
  await page.goto('/');
  const headers = page.locator('.plot-table th');
  await expect(headers).toHaveText(['Shop', 'Zone', 'Status']);
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByRole('menuitem', { name: 'Tags' }).click();
  await page.locator('.filters__popup input[type="text"]').first().fill('Rental');
  await page.locator('.filters__popup .tag-picker__option').first().click();
  await page.mouse.click(5, 5);
  await expect(headers).toHaveText(['Shop', 'Status', 'About']);
  await expect(page.locator('.plot-table__about').first()).toHaveText('Slime shop for slimey needs.');
  await page.getByPlaceholder('Search shops, owners, comments...').fill('slime');
  await expect(headers, 'searching wins').toHaveText(['Shop', 'Status', 'Match']);
  await page.getByPlaceholder('Search shops, owners, comments...').fill('');

  // "Has none of" counts as a tag filter too.
  await page.locator('.filters__chip-label').click();
  await page.locator('.filters__popup').getByRole('button', { name: /has none of/i }).click();
  await page.mouse.click(5, 5);
  await expect(page.locator('.filters__chip-label')).toContainText('has none of');
  await expect(headers).toHaveText(['Shop', 'Status', 'About']);
  await expect(page.locator('.plot-table__open[data-plot-id="corridors-1"]'), 'the Rental shop is left out').toHaveCount(0);
  await expectNoProblems(page);
});

test('desktop: the columns and the map keep their size and place when a card opens', async ({ browser }) => {
  const page = await pageAs(browser, server, null, { viewport: { width: 1366, height: 800 } });
  await page.goto('/');
  const boxes = () => Promise.all(['.market-map', '.app-main__map', '.app-main__list'].map((s) => page.locator(s).boundingBox()));
  const [map, left, right] = await boxes();
  expect(Math.abs((map.x + map.width / 2) - (left.x + left.width / 2)), 'the map is centered in its column').toBeLessThan(1);
  await page.locator('.plot-table__open').nth(2).click();
  await expect(page.locator('section.plot-detail__sheet--inline')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  const [mapNow, leftNow, rightNow] = await boxes();
  expect(mapNow).toEqual(map);
  expect([leftNow.x, leftNow.width, rightNow.x, rightNow.width]).toEqual([left.x, left.width, right.x, right.width]);
});
