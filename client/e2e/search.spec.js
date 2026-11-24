// The main search (App): results follow the typing (useDeferredValue), the
// best matches rank first, the table and map dim what doesn't match, and
// matching tags are offered.

import { expect, test } from '@playwright/test';
import { DESKTOP, expectNoProblems, pageAs, serverForFile } from './helpers.js';

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
