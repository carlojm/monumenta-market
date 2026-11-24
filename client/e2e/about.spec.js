// The About page (4.1), reached from the navbar on every page.

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, expectNoProblems, pageAs, serverForFile } from './helpers.js';

const server = serverForFile();

for (const [size, options] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`the navbar links to About (${size})`, async ({ browser }) => {
    const page = await pageAs(browser, server, null, options);
    await page.goto('/');
    await page.getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole('heading', { level: 2, name: 'About' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Link a new account' })).toHaveAttribute('href', '/account?tab=link');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no sideways scroll').toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/about-${size}.png`, fullPage: true });
    await expectNoProblems(page);
  });
}
