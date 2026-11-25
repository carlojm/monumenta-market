// Shop images (3.11): the screenshots sit at the top of the card. They're
// part of edits: the owner, maintainers and staff add and remove them in the
// edit form, and an edit adding one waits for a moderator unless a moderator
// made it, like any suggestion (on the card or in the admin queue).

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
const gallery = () => page.locator('.plot-detail__gallery > .plot-detail__carousel'); // the banner, not the viewer
const viewer = () => page.getByRole('dialog', { name: 'Screenshot, full size' });
const form = () => page.locator('.shop-edit');
const edit = () => page.getByRole('button', { name: 'Edit', exact: true }).click();
const button = (name) => form().getByRole('button', { name, exact: true });
const inEdit = () => form().getByRole('list', { name: 'Screenshots in your edit' });
// The card's suggestions waiting for review, opened.
async function openPending() {
  await page.locator('.pending-edits').getByRole('button', { name: 'Show' }).click();
  return page.locator('.pending-edits__list > li').first();
}

test('other players: a plain banner, and no images in the edit form', async ({ browser }) => {
  page = await pageAs(browser, server, 'Tester', PHONE);
  await page.goto(`/plot/${P}`);
  await expect(page.locator('.plot-detail__meta')).toBeVisible();
  await expect(gallery(), 'no screenshots yet').toHaveCount(0);
  // A plain banner instead, with the card's buttons over it, like a card with screenshots.
  const [banner, close] = await Promise.all([page.locator('.plot-detail__banner').boundingBox(),
    page.getByRole('button', { name: 'Close' }).boundingBox()]);
  expect(close.y + close.height).toBeLessThan(banner.y + banner.height);
  await edit();
  await expect(form()).toBeVisible();
  await expect(form().getByText('Add screenshots')).toHaveCount(0);
  await expect(form().getByLabel('Banner color')).toHaveCount(0);
  await expectNoProblems(page);
  await page.context().close();
});

test("the owner picks a banner color: a Force edit, shown while there are no screenshots", async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', DESKTOP);
  await page.goto(`/plot/${P}`);
  await edit();
  await form().getByLabel('Banner color').fill('#3a7bd5');
  await button('Force edit').click();
  await expect(page.getByRole('status').filter({ hasText: 'Edit saved.' })).toBeAttached();
  await expect(page.locator('.plot-detail__banner')).toHaveCSS('background-color', 'rgb(58, 123, 213)');
  await expectNoProblems(page);
  await page.context().close();
});

test('the owner adds a screenshot: part of the edit, and it must be suggested', async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', PHONE);
  await page.goto(`/plot/${P}`);
  await edit();
  await expect(form()).toContainText('ONLY in-game screenshots');
  await expect(button('Force edit'), 'before adding one, the owner can Force edit').toBeVisible();
  await form().getByLabel('Add screenshots').setInputFiles(await png(page, 'shop.png'));
  await expect(inEdit().getByRole('img', { name: 'Screenshot 1' })).toBeVisible();
  await expect(button('Force edit'), 'a new image needs a moderator').toHaveCount(0);
  await expect(form()).toContainText('A moderator reviews it before it shows.');
  await button('Show changes').click();
  await expect(form().getByRole('img', { name: 'Screenshot, added' })).toBeVisible();
  await button('Back to editing').click();

  // A file that's too small is refused with the reason, and the edit keeps the first.
  await form().getByLabel('Add screenshots').setInputFiles(await png(page, 'tiny.png', 300, 200));
  await expect(form().getByRole('alert')).toContainText('tiny.png: Screenshots need to be at least 640 by 360 pixels.');
  await expect(inEdit().getByRole('listitem')).toHaveCount(1);

  await button('Suggest edit').click();
  await expect(page.getByText('Sent for review.', { exact: true })).toBeVisible();
  await expect(gallery(), 'not on the card yet').toHaveCount(0);
  const item = await openPending();
  await expect(item.getByRole('img', { name: 'Screenshot, added' })).toBeVisible();
  await expect(item.getByRole('button', { name: 'Approve' }), 'only a moderator approves it').toHaveCount(0);
  await expectNoProblems(page, { statuses: [400] });
  await page.context().close();
});

test('a moderator approves it on the card; players see it, and the whole picture in the viewer', async ({ browser }) => {
  page = await pageAs(browser, server, 'ModTester', DESKTOP);
  await page.goto(`/plot/${P}`);
  await (await openPending()).getByRole('button', { name: 'Approve' }).click();
  await expect(gallery().getByRole('button', { name: 'Screenshot 1 of 1, open full size' })).toBeVisible();
  const box = await gallery().boundingBox();
  expect(Math.abs(box.width / box.height - 2), 'desktop: a shorter 2:1 banner').toBeLessThan(0.02);
  await expectNoProblems(page);
  await page.context().close();

  page = await pageAs(browser, server, 'Tester', PHONE);
  await page.goto(`/plot/${P}`);
  const picture = gallery().getByRole('button', { name: 'Screenshot 1 of 1, open full size' });
  await expect(picture, 'players see it').toBeVisible();
  // The caption is there for screen readers; on screen, on hover and in the viewer.
  await expect(gallery().locator('figcaption')).toHaveText('By ShopOwner');
  await expect(gallery().locator('.plot-detail__carousel-by')).toHaveCSS('opacity', '0');
  await picture.click();
  await expect(viewer().getByRole('img', { name: 'Screenshot 1 of 1' })).toBeVisible();
  await expect(viewer().locator('.plot-detail__carousel-by')).toHaveCSS('opacity', '1');
  await viewer().getByRole('button', { name: 'Close screenshot' }).click();
  await expect(viewer()).toBeHidden();
  // The card's buttons float over it, top right; it's above the details.
  const [frame, close, details] = await Promise.all([gallery().boundingBox(),
    page.getByRole('button', { name: 'Close' }).boundingBox(), page.locator('.plot-detail__meta').boundingBox()]);
  expect(close.y).toBeLessThan(frame.y + frame.height / 3);
  expect(close.x).toBeGreaterThan(frame.x + frame.width / 2);
  expect(frame.y).toBeLessThan(details.y);
  await page.context().close();
});

test('the admin queue shows an edit with a new screenshot; approving puts it on the card', async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', PHONE);
  await page.goto(`/plot/${P}`);
  await edit();
  await form().getByLabel('Add screenshots').setInputFiles(await png(page, 'second.png', 1920, 1080, '#47a'));
  await expect(inEdit().getByRole('listitem')).toHaveCount(2);
  await button('Suggest edit').click();
  await expect(page.getByText('Sent for review.', { exact: true })).toBeVisible();
  await page.context().close();

  page = await pageAs(browser, server, 'ModTester', DESKTOP);
  await page.goto('/admin');
  const tab = page.locator('.admin-page__tabs').getByRole('button', { name: /Needs review/ });
  await expect(tab).toHaveText('Needs review (1)');
  const item = page.locator('.admin-review__item');
  await expect(item.getByRole('img', { name: 'Screenshot, added' })).toBeVisible();
  await item.getByRole('button', { name: 'Approve' }).click();
  await expect(tab).toHaveText('Needs review (0)');
  await page.goto(`/plot/${P}`);
  await expect(gallery().locator('.plot-detail__carousel-count')).toHaveText('1 / 2');
  await expectNoProblems(page);
  await page.context().close();
});

test("a moderator's screenshot is live at once; the banner keeps its size; Escape closes only the viewer", async ({ browser }) => {
  page = await pageAs(browser, server, 'ModTester', PHONE);
  await page.goto(`/plot/${P}`);
  await edit();
  await expect(form(), "a moderator's own images need no review").not.toContainText('Images must be approved');
  await form().getByLabel('Add screenshots').setInputFiles(await png(page, 'square.png', 900, 900, '#a47'));
  await expect(inEdit().getByRole('listitem')).toHaveCount(3);
  await button('Force edit').click();
  const count = gallery().locator('.plot-detail__carousel-count');
  await expect(count).toHaveText('1 / 3');
  const heights = [];
  for (let i = 0; i < 3; i++) {
    heights.push(Math.round((await gallery().boundingBox()).height));
    await gallery().getByRole('button', { name: 'Next screenshot' }).click();
  }
  expect(new Set(heights).size, `the same height every time: ${heights}`).toBe(1);
  const { width } = await gallery().boundingBox();
  expect(Math.abs(heights[0] - (width * 9) / 16), '16:9 on phones, whatever the screenshots are').toBeLessThan(1.5);

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

test('the owner removes a screenshot with a Force edit', async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', DESKTOP);
  await page.goto(`/plot/${P}`);
  await edit();
  await inEdit().getByRole('button', { name: 'Remove screenshot 3' }).click();
  await expect(inEdit().getByRole('listitem')).toHaveCount(2);
  await button('Force edit').click();
  await expect(page.getByRole('status').filter({ hasText: 'Edit saved.' })).toBeAttached();
  await expect(gallery().locator('.plot-detail__carousel-count')).toHaveText('1 / 2');
  await expectNoProblems(page);
  await page.context().close();
});

test('icons: the owner suggests one, a moderator approves it, and it shows in the list', async ({ browser }) => {
  page = await pageAs(browser, server, 'ShopOwner', PHONE);
  await page.goto(`/plot/${P}`);
  await edit();
  await expect(form()).toContainText('Must be some kind of icon representing your shop');
  // Not square: cut to one.
  await form().getByLabel('Add icon').setInputFiles(await png(page, 'icon.png', 200, 100, '#c33'));
  await expect(form().getByRole('img', { name: "The shop's icon" })).toBeVisible();
  await expect(form().getByLabel('Replace icon')).toBeAttached();
  await button('Suggest edit').click();
  await expect(page.getByText('Sent for review.', { exact: true })).toBeVisible();
  await page.context().close();

  page = await pageAs(browser, server, 'ModTester', DESKTOP);
  await page.goto('/');
  const row = page.getByRole('row').filter({ has: page.locator(`[data-plot-id="${P}"]`) });
  await expect(row).toBeVisible();
  await expect(page.locator('.plot-table__icon'), 'no shop has one yet: no icon space').toHaveCount(0);
  await page.goto(`/plot/${P}`);
  const item = await openPending();
  await expect(item.getByRole('img', { name: 'Icon, added' })).toBeVisible();
  await item.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('.plot-detail__shop-icon')).toBeVisible();

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
  await page.context().close();

  // The owner takes it off again: removing needs no review.
  page = await pageAs(browser, server, 'ShopOwner', DESKTOP);
  await page.goto(`/plot/${P}`);
  await edit();
  await form().getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(form().getByLabel('Add icon')).toBeAttached();
  await button('Force edit').click();
  await expect(page.getByRole('status').filter({ hasText: 'Edit saved.' })).toBeAttached();
  await expect(page.locator('.plot-detail__shop-icon')).toHaveCount(0);
  await page.context().close();
});
