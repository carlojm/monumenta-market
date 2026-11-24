// Shop images on the card (3.11): only the owner, maintainers and staff add
// screenshots; the owner's wait for a moderator, who approves them on the card
// or in the admin queue; the owner picks the cover with the crop box.

import { expect, test } from '@playwright/test';
import { DESKTOP, PHONE, expectNoProblems, pageAs, readDb, serverForFile } from './helpers.js';

const server = serverForFile();
const P = 'corridors-2'; // ShopOwner's
const cover = () => {
  const db = readDb(server);
  try { return db.prepare('SELECT cover_image_id, cover_crop FROM shops WHERE plot_id = ? AND closed_at IS NULL').get(P); } finally { db.close(); }
};

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
  await expect(section().getByText('No screenshots yet.')).toBeVisible();
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
  await expect(section().getByRole('img', { name: 'Screenshot 1 of 1, full size' })).toBeVisible();
  await expect(section()).toContainText('By ShopOwner');
  await expect(section().getByRole('list', { name: 'Waiting for review' })).toHaveCount(0);
  await expectNoProblems(page);
  await page.context().close();

  page = await pageAs(browser, server, 'Tester', PHONE);
  await page.goto(`/plot/${P}`);
  await expect(section().getByRole('img', { name: 'Screenshot 1 of 1, full size' }), 'players see it').toBeVisible();
  await expect(section().getByRole('button'), 'but no buttons to change anything').toHaveCount(0);
  await page.context().close();
  page = await pageAs(browser, server, 'ShopOwner', DESKTOP);
  await page.goto(`/plot/${P}`);
});

test('the owner picks the cover and drags the crop box', async () => {
  await section().getByRole('button', { name: 'Use as cover' }).click();
  const box = section().locator('.cover-picker__box');
  await expect(box).toBeVisible();
  const start = await box.boundingBox();
  const frame = await section().locator('.cover-picker__frame').boundingBox();
  // A 16:9 picture: the biggest banner is full width, in the middle.
  expect(Math.round(start.width)).toBe(Math.round(frame.width));
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 500, { steps: 5 });
  await page.mouse.up();
  const moved = await box.boundingBox();
  expect(Math.round(moved.y + moved.height), 'dragged to the bottom edge, no further').toBe(Math.round(frame.y + frame.height));
  // Shrink it by its corner, then nudge it up with the keyboard.
  const corner = section().locator('.cover-picker__corner');
  const c = await corner.boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x - 100, c.y, { steps: 5 });
  await page.mouse.up();
  expect((await box.boundingBox()).width).toBeLessThan(moved.width - 50);
  await box.focus();
  await page.keyboard.press('ArrowUp');
  await expect(section().locator('.cover-image'), 'a live preview').toBeVisible();
  await section().getByRole('button', { name: 'Save cover' }).click();

  await expect(page.locator('.plot-detail__sheet > .cover-image, .cover-image').first()).toBeVisible();
  await expect(section().locator('.shop-images__credit')).toContainText('Cover');
  const saved = cover();
  const crop = JSON.parse(saved.cover_crop);
  // Dragged down: its top at 1 - 0.71 (a full-width banner of a 16:9
  // picture is 0.71 of its height), then up by one arrow step (0.02).
  // Resizing keeps the top-left corner where it is.
  expect(crop.y).toBeCloseTo(0.289 - 0.02, 2);
  expect(crop.w).toBeLessThan(0.9);
  await expectNoProblems(page);
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
