// Shop images on the card (3.11): only the owner, maintainers and staff add
// screenshots; the owner's wait for a moderator, who approves them on the card
// or in the admin queue. The screenshots sit at the top of the card.

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, expectNoProblems, pageAs, serverForFile } from './helpers.js';

const server = serverForFile();
const P = 'corridors-2'; // ShopOwner's

// A PNG drawn by the page's canvas, as a file for an <input type="file">.
async function png(page, name, width = 1280, height = 720, color = '#4a7') {
  const data = await page.evaluate(([w, h, c]) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(w / 4, h / 4, w / 2, h / 2);
    return canvas.toDataURL('image/png').split(',')[1];
  }, [width, height, color]);
  return { name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

let page;
const section = () => page.locator('.shop-images');

test('other players see no way to add screenshots', async ({ browser }) => {
  page = await pageAs(browser, server, 'Tester', PHONE);
  await page.goto(`/plot/${P}`);
  await expect(page.locator('.plot-detail__meta')).toBeVisible();
  await expect(section(), 'no screenshots, nothing to add: no section').toHaveCount(0);
  await expectNoProblems(page);
  await page.context().close();
});

test('the owner adds a screenshot: the guidelines, then it waits for a moderator', async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', PHONE);
  await page.goto(`/plot/${P}`);
  const add = section().getByRole('button', { name: 'Add screenshots' });
  await add.click();
  await expect(add).toHaveAttribute('aria-expanded', 'true');
  await expect(section()).toContainText('ONLY in-game screenshots');
  await expect(section()).toContainText('Images must be approved by a moderator before being shown');
  await section().getByLabel('Choose screenshots').setInputFiles(await png(page, 'shop.png'));
  await expect(page.getByRole('status').filter({ hasText: '1 screenshot sent for review.' })).toBeAttached();
  const waiting = section().getByRole('list', { name: 'Waiting for review' });
  await expect(waiting).toContainText('Screenshot from ShopOwner, waiting for review');
  await expect(waiting.getByRole('button', { name: 'Withdraw' })).toBeVisible();
  await expect(waiting.getByRole('button', { name: 'Approve' }), 'only moderators approve').toHaveCount(0);
  await expectNoProblems(page);
});

test('a file that is too small is refused with the reason', async () => {
  await section().getByRole('button', { name: 'Add screenshots' }).click(); // it closed after the last upload
  await section().getByLabel('Choose screenshots').setInputFiles(await png(page, 'tiny.png', 300, 200));
  await expect(section().getByRole('alert')).toContainText('tiny.png: Screenshots need to be at least 640 by 360 pixels.');
  await expectNoProblems(page, { statuses: [400] });
  await page.context().close();
});

test('a moderator approves it on the card, and it shows in the carousel', async ({ browser }) => {
  page = await pageAs(browser, server, 'ModTester', DESKTOP);
  await page.goto(`/plot/${P}`);
  await section().getByRole('button', { name: 'Approve' }).click();
  await expect(section().getByRole('img', { name: 'Screenshot 1 of 1' })).toBeVisible();
  await expect(section()).toContainText('By ShopOwner');
  await expect(section().getByRole('list', { name: 'Waiting for review' })).toHaveCount(0);
  await expectNoProblems(page);
  await page.context().close();

  page = await pageAs(browser, server, 'Tester', PHONE);
  await page.goto(`/plot/${P}`);
  await expect(section().getByRole('img', { name: 'Screenshot 1 of 1' }), 'players see it').toBeVisible();
  await expect(section().getByRole('button'), 'but no buttons to change anything').toHaveCount(0);
  // At the top: before the owner, plot and status details.
  const [pictures, details] = await Promise.all([section().boundingBox(), page.locator('.plot-detail__meta').boundingBox()]);
  expect(pictures.y).toBeLessThan(details.y);
  await page.context().close();
});

test('the admin queue lists waiting images; approving one removes it', async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', PHONE);
  await page.goto(`/plot/${P}`);
  await section().getByRole('button', { name: 'Add screenshots' }).click();
  await section().getByLabel('Choose screenshots').setInputFiles(await png(page, 'second.png', 1920, 1080, '#47a'));
  await expect(section().getByRole('list', { name: 'Waiting for review' })).toBeVisible();
  await page.context().close();

  page = await pageAs(browser, server, 'ModTester', DESKTOP);
  await page.goto('/admin');
  const tab = page.locator('.admin-page__tabs').getByRole('button', { name: /Needs review/ });
  await expect(tab).toHaveText('Needs review (1)');
  const item = page.locator('.admin-review__image');
  await expect(item).toContainText('Screenshot from ShopOwner');
  await item.getByRole('button', { name: 'Approve' }).click();
  await expect(item).toHaveCount(0);
  await expect(tab).toHaveText('Needs review (0)');
  await page.goto(`/plot/${P}`);
  await expect(section().locator('.plot-detail__carousel-count')).toHaveText('1 / 2');
  await expectNoProblems(page);
  await page.context().close();
});

test('screenshots of different shapes: the frame keeps its size, and a tap opens nothing', async ({ browser }) => {
  page = await pageAs(browser, server, 'ModTester', PHONE);
  await page.goto(`/plot/${P}`);
  await section().getByRole('button', { name: 'Add screenshots' }).click();
  await section().getByLabel('Choose screenshots').setInputFiles(await png(page, 'square.png', 900, 900, '#a47'));
  const count = section().locator('.plot-detail__carousel-count');
  await expect(count).toHaveText('1 / 3');
  const frame = section().locator('.plot-detail__carousel');
  const heights = [];
  for (let i = 0; i < 3; i++) {
    heights.push(Math.round((await frame.boundingBox()).height));
    await section().getByRole('button', { name: 'Next screenshot' }).click();
  }
  expect(new Set(heights).size, `the same height every time: ${heights}`).toBe(1);
  const { width } = await frame.boundingBox();
  expect(Math.abs(heights[0] - (width * 9) / 16), '16:9, whatever the screenshots are').toBeLessThan(1.5);
  await expect(frame.locator('a'), 'no link').toHaveCount(0);
  await expectNoProblems(page);
  await page.context().close();
});
