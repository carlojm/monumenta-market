// Shop images (3.11): the screenshots sit at the top of the card. Only the
// owner, maintainers and staff add and delete them, in the edit view; the
// owner's wait for a moderator, who approves them there or in the admin queue.

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
// On the card: the screenshots. In the edit view: adding and deleting them.
const gallery = () => page.locator('.plot-detail__gallery > .plot-detail__carousel'); // the banner, not the viewer
const viewer = () => page.getByRole('dialog', { name: 'Screenshot, full size' });
const manager = () => page.locator('.shop-images');
const edit = () => page.getByRole('button', { name: 'Edit', exact: true }).click();
const stopEditing = () => page.locator('.shop-edit').getByRole('button', { name: 'Cancel' }).click();

test('other players see no way to add screenshots, even in the edit view', async ({ browser }) => {
  page = await pageAs(browser, server, 'Tester', PHONE);
  await page.goto(`/plot/${P}`);
  await expect(page.locator('.plot-detail__meta')).toBeVisible();
  await expect(gallery(), 'no screenshots yet').toHaveCount(0);
  // A plain banner instead, with the card's buttons over it, like a card with screenshots.
  const [banner, close] = await Promise.all([page.locator('.plot-detail__banner').boundingBox(),
    page.getByRole('button', { name: 'Close' }).boundingBox()]);
  expect(close.y + close.height).toBeLessThan(banner.y + banner.height);
  await edit();
  await expect(page.locator('.shop-edit')).toBeVisible();
  await expect(manager()).toHaveCount(0);
  await expectNoProblems(page);
  await page.context().close();
});

test('the owner adds a screenshot in the edit view: the guidelines, then it waits for a moderator', async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', PHONE);
  await page.goto(`/plot/${P}`);
  await expect(page.locator('.plot-detail__meta')).toBeVisible();
  await expect(page.getByText('Add screenshots'), 'not on the card itself').toHaveCount(0);
  await edit();
  await expect(manager().getByRole('heading', { name: 'Screenshots' })).toBeVisible();
  await expect(manager()).toContainText('ONLY in-game screenshots');
  await expect(manager()).toContainText('Images must be approved by a moderator before being shown');
  await manager().getByLabel('Add screenshots').setInputFiles(await png(page, 'shop.png'));
  await expect(page.getByRole('status').filter({ hasText: '1 screenshot sent for review.' })).toBeAttached();
  const waiting = manager().getByRole('list', { name: 'Screenshots waiting for review' });
  await expect(waiting).toContainText('Screenshot from ShopOwner, waiting for review');
  await expect(waiting.getByRole('button', { name: 'Withdraw' })).toBeVisible();
  await expect(waiting.getByRole('button', { name: 'Approve' }), 'only moderators approve').toHaveCount(0);
  await expect(page.locator('.shop-edit'), 'still editing').toBeVisible();
  await expectNoProblems(page);
});

test('a file that is too small is refused with the reason', async () => {
  await manager().getByLabel('Add screenshots').setInputFiles(await png(page, 'tiny.png', 300, 200));
  await expect(manager().getByRole('alert')).toContainText('tiny.png: Screenshots need to be at least 640 by 360 pixels.');
  await expectNoProblems(page, { statuses: [400] });
  await page.context().close();
});

test('a moderator approves it in the edit view; players see it, with who added it as a caption', async ({ browser }) => {
  page = await pageAs(browser, server, 'ModTester', DESKTOP);
  await page.goto(`/plot/${P}`);
  await edit();
  await manager().getByRole('list', { name: 'Screenshots waiting for review' }).getByRole('button', { name: 'Approve' }).click();
  const live = manager().getByRole('list', { name: 'On the card' });
  await expect(live).toContainText('By ShopOwner');
  await expect(live.getByRole('button', { name: 'Delete screenshot 1' })).toBeVisible();
  await expect(manager().getByRole('list', { name: 'Screenshots waiting for review' })).toHaveCount(0);
  await stopEditing();
  await expect(gallery().getByRole('button', { name: 'Screenshot 1 of 1, open full size' })).toBeVisible();
  const box = await gallery().boundingBox();
  expect(Math.abs(box.width / box.height - 2), 'desktop: a shorter 2:1 banner').toBeLessThan(0.02);
  await expectNoProblems(page);
  await page.context().close();

  page = await pageAs(browser, server, 'Tester', PHONE);
  await page.goto(`/plot/${P}`);
  const picture = gallery().getByRole('button', { name: 'Screenshot 1 of 1, open full size' });
  await expect(picture, 'players see it').toBeVisible();
  await expect(gallery().getByRole('button'), 'no arrows with one screenshot').toHaveCount(1);
  // The caption is there for screen readers; on screen, on hover and in the viewer.
  await expect(gallery().locator('figcaption')).toHaveText('By ShopOwner');
  await expect(gallery().locator('.plot-detail__carousel-by')).toHaveCSS('opacity', '0');
  await picture.click();
  await expect(viewer().getByRole('img', { name: 'Screenshot 1 of 1' })).toBeVisible();
  await expect(viewer().locator('.plot-detail__carousel-by')).toHaveCSS('opacity', '1');
  await viewer().getByRole('button', { name: 'Close screenshot' }).click();
  await expect(viewer()).toBeHidden();
  // The card's buttons float over it, top right.
  const [frame, close] = await Promise.all([gallery().boundingBox(), page.getByRole('button', { name: 'Close' }).boundingBox()]);
  expect(close.y).toBeLessThan(frame.y + frame.height / 3);
  expect(close.x).toBeGreaterThan(frame.x + frame.width / 2);
  // At the top: before the owner, plot and status details.
  const [pictures, details] = await Promise.all([gallery().boundingBox(), page.locator('.plot-detail__meta').boundingBox()]);
  expect(pictures.y).toBeLessThan(details.y);
  await page.context().close();
});

test('the admin queue lists waiting images; approving one removes it', async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', PHONE);
  await page.goto(`/plot/${P}`);
  await edit();
  await manager().getByLabel('Add screenshots').setInputFiles(await png(page, 'second.png', 1920, 1080, '#47a'));
  await expect(manager().getByRole('list', { name: 'Screenshots waiting for review' })).toBeVisible();
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
  await expect(gallery().locator('.plot-detail__carousel-count')).toHaveText('1 / 2');
  await expectNoProblems(page);
  await page.context().close();
});

test('screenshots of different shapes: the banner keeps its size; the viewer shows them whole', async ({ browser }) => {
  page = await pageAs(browser, server, 'ModTester', PHONE);
  await page.goto(`/plot/${P}`);
  await edit();
  await manager().getByLabel('Add screenshots').setInputFiles(await png(page, 'square.png', 900, 900, '#a47'));
  await expect(page.getByRole('status').filter({ hasText: '1 screenshot added.' })).toBeAttached();
  await stopEditing();
  const count = gallery().locator('.plot-detail__carousel-count');
  await expect(count).toHaveText('1 / 3');
  const heights = [];
  for (let i = 0; i < 3; i++) {
    heights.push(Math.round((await gallery().boundingBox()).height));
    await gallery().getByRole('button', { name: 'Next screenshot' }).click();
  }
  expect(new Set(heights).size, `the same height every time: ${heights}`).toBe(1);
  const { width } = await gallery().boundingBox();
  expect(Math.abs(heights[0] - (width * 9) / 16), '16:9, whatever the screenshots are').toBeLessThan(1.5);
  await expect(gallery().locator('a'), 'no link').toHaveCount(0);

  // The square one (the newest, third), whole in the viewer; Escape closes
  // the viewer only, not the card.
  await gallery().getByRole('button', { name: 'Previous screenshot' }).click();
  await gallery().getByRole('button', { name: 'Screenshot 3 of 3, open full size' }).click();
  const whole = viewer().getByRole('img', { name: 'Screenshot 3 of 3' });
  await expect(whole).toBeVisible();
  await expect.poll(async () => { const b = await whole.boundingBox(); return Math.round((b.width / b.height) * 10); }).toBe(10);
  await page.keyboard.press('ArrowRight');
  await expect(viewer().getByRole('img', { name: 'Screenshot 1 of 3' }), 'arrow keys move').toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer()).toBeHidden();
  await expect(page.locator('.plot-detail__meta'), 'the card stays open').toBeVisible();
  await expectNoProblems(page);
  await page.context().close();
});

test('the owner deletes a screenshot in the edit view, after a confirm', async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', DESKTOP);
  await page.goto(`/plot/${P}`);
  await edit();
  const live = manager().getByRole('list', { name: 'On the card' });
  await live.getByRole('button', { name: 'Delete screenshot 3' }).click();
  await expect(live).toContainText('Delete this screenshot?');
  await live.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Screenshot deleted.' })).toBeAttached();
  await expect(live.getByRole('listitem')).toHaveCount(2);
  await expectNoProblems(page);
  await page.context().close();
});

test('icons: the owner adds one, a moderator approves it, and it shows in the list', async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', PHONE);
  await page.goto(`/plot/${P}`);
  await edit();
  await expect(manager()).toContainText('Must be some kind of icon representing your shop');
  // Not square: cut to one.
  await manager().getByLabel('Add icon').setInputFiles(await png(page, 'icon.png', 200, 100, '#c33'));
  await expect(page.getByRole('status').filter({ hasText: 'Icon sent for review.' })).toBeAttached();
  await expect(manager().getByRole('list', { name: 'Icons waiting for review' })).toContainText('Icon from ShopOwner');
  await page.context().close();

  page = await pageAs(browser, server, 'ModTester', DESKTOP);
  await page.goto('/');
  const row = page.getByRole('row').filter({ has: page.locator(`[data-plot-id="${P}"]`) });
  await expect(row).toBeVisible();
  await expect(page.locator('.plot-table__icon'), 'no shop has one yet: no icon space').toHaveCount(0);
  await page.goto(`/plot/${P}`);
  await edit();
  await manager().getByRole('list', { name: 'Icons waiting for review' }).getByRole('button', { name: 'Approve' }).click();
  await expect(manager().getByRole('img', { name: "The shop's icon" })).toBeVisible();
  await expect(manager().getByLabel('Replace icon')).toBeAttached();

  await page.goto('/');
  const icon = row.locator('img.plot-table__icon');
  await expect(icon).toBeVisible();
  expect(await icon.evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual([128, 128]);
  // Shops without one keep the space, so the names line up.
  const [mine, other] = await Promise.all([
    row.locator('.plot-table__open').boundingBox(),
    page.getByRole('row').filter({ has: page.locator('[data-plot-id="corridors-1"]') }).locator('.plot-table__open').boundingBox(),
  ]);
  expect(Math.abs(mine.x - other.x)).toBeLessThan(1);
  await expectNoProblems(page);

  // And deleting it, after a confirm.
  await page.goto(`/plot/${P}`);
  await edit();
  await manager().getByRole('button', { name: 'Delete icon' }).click();
  await manager().getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Icon deleted.' })).toBeAttached();
  await expect(manager().getByLabel('Add icon')).toBeAttached();
  await page.context().close();
});
