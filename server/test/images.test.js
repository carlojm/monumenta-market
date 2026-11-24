// Shop images (3.11): uploads re-encoded to WebP; the owner, maintainers and
// staff upload; a moderator approves the owner's and maintainers' uploads;
// the icon, the cover and the limits. Files go to the test server's own
// folder (lib/imageStore.js), never to real storage.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { startServer } from './helpers/server.js';
import { apiFor, readDb, show, snapshot, writeDb } from './helpers/api.js';

let server, as;
before(async () => { server = await startServer(); as = apiFor(server); });
after(() => server.stop());

const P = 'corridors-2'; // ShopOwner's
const OTHER = 'corridors-1';
const picture = (width = 1280, height = 720, color = '#4a7') =>
  sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
const detail = async (name, plot = P) => (await as(name).get(`/api/plots/${plot}`)).body.shop;
const fetchFile = (url) => fetch(`${server.url}${url}`);
const upload = async (name, kind = 'gallery', file = null, plot = P) =>
  as(name).upload(`/api/plots/${plot}/images`, { kind }, file ?? await picture());
const modLog = (action) => {
  const db = readDb(server);
  try { return db.prepare('SELECT * FROM mod_log WHERE action = ? ORDER BY id DESC').all(action); } finally { db.close(); }
};

test('only the owner, maintainers and staff upload', async () => {
  assert.equal((await upload(null)).status, 401);
  const player = await upload('Tester');
  assert.equal(player.status, 403, show(player));
  assert.match(player.body.error, /owner, its maintainers or a moderator/);
});

let pendingId;
test("the owner's screenshot waits for a moderator, and is a clean WebP", async () => {
  // A phone photo with its location in it.
  const jpg = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#a74' } })
    .withExif({ IFD0: { Make: 'PhoneCo' }, IFD3: { GPSLatitude: '40/1 26/1 46/1', GPSLatitudeRef: 'N' } }).jpeg().toBuffer();
  const r = await as('ShopOwner').upload(`/api/plots/${P}/images`, { kind: 'gallery' }, jpg, 'photo.jpg');
  assert.equal(r.status, 201, show(r));
  assert.equal(r.body.status, 'pending');
  pendingId = r.body.id;

  const file = Buffer.from(await (await fetchFile(r.body.url)).arrayBuffer());
  const meta = await sharp(file).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.exif, undefined, 'no EXIF (location, camera) left');
  assert.deepEqual([meta.width, meta.height], [1600, 900]);
  const card = await sharp(Buffer.from(await (await fetchFile(r.body.card_url)).arrayBuffer())).metadata();
  assert.equal(card.width, 960, 'a smaller copy for the card');

  assert.equal((await detail(null)).images.length, 0, 'not public yet');
  assert.deepEqual((await detail(null)).pending_images, []);
  assert.deepEqual((await detail('Tester')).pending_images, [], 'other players do not see it');
  assert.deepEqual((await detail('ShopOwner')).pending_images.map((i) => i.id), [pendingId], 'the owner sees it');
  assert.deepEqual((await detail('ModTester')).pending_images.map((i) => i.id), [pendingId], 'staff see it');
  assert.equal(modLog('image.suggest').length, 1);
});

test('a maintainer uploads like the owner', async () => {
  const base = await snapshot(as, P);
  const made = await as('ShopOwner').post(`/api/plots/${P}/revisions`,
    { action: 'edit', base, proposed: { ...base, maintainers: 'Player2' } });
  assert.equal(made.status, 201, show(made));
  const r = await upload('Player2');
  assert.equal(r.status, 201, show(r));
  assert.equal(r.body.status, 'pending');
  assert.equal((await as('Player2').delete(`/api/images/${r.body.id}`)).status, 200, 'and can take it back');
  assert.equal(modLog('image.withdraw').length, 1);
});

test('the review queue is for staff', async () => {
  const queue = (await as('ModTester').get('/api/images/pending')).body;
  assert.deepEqual(queue.map((i) => [i.id, i.plot_id, i.uploader]), [[pendingId, P, 'ShopOwner']]);
  assert.deepEqual((await as('ShopOwner').get('/api/images/pending')).body, []);
});

test('only staff approve', async () => {
  assert.equal((await as('ShopOwner').post(`/api/images/${pendingId}/approve`)).status, 403, 'not the owner');
  assert.equal((await as('Tester').post(`/api/images/${pendingId}/approve`)).status, 403);
  const r = await as('ModTester').post(`/api/images/${pendingId}/approve`);
  assert.equal(r.status, 200, show(r));
  assert.deepEqual((await detail(null)).images.map((i) => [i.id, i.uploader]), [[pendingId, 'ShopOwner']]);
  assert.equal((await as('ModTester').post(`/api/images/${pendingId}/approve`)).status, 409, 'already reviewed');
});

test("a moderator's own upload is live at once", async () => {
  const r = await upload('ModTester');
  assert.equal(r.status, 201, show(r));
  assert.equal(r.body.status, 'approved');
  assert.equal((await detail(null)).images.length, 2);
  assert.equal(modLog('image.add').length, 1);
});

test('rejecting deletes the upload and its files', async () => {
  const r = await upload('ShopOwner');
  assert.equal((await as('ShopOwner').post(`/api/images/${r.body.id}/reject`)).status, 403, 'not the owner');
  const reject = await as('ModTester').post(`/api/images/${r.body.id}/reject`);
  assert.equal(reject.status, 200, show(reject));
  assert.equal((await fetchFile(r.body.url)).status, 404);
  assert.equal((await fetchFile(r.body.card_url)).status, 404);
  assert.equal((await detail('ShopOwner')).pending_images.length, 0);
});

test('the owner can delete the shop\'s images; other players cannot', async () => {
  const r = await upload('ModTester');
  assert.equal((await as('Tester').delete(`/api/images/${r.body.id}`)).status, 403);
  assert.equal((await as('ShopOwner').delete(`/api/images/${r.body.id}`)).status, 200);
  assert.equal((await fetchFile(r.body.url)).status, 404);
});

test('only real images of a usable size get in', async () => {
  const text = await as('ShopOwner').upload(`/api/plots/${P}/images`, { kind: 'gallery' }, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg');
  assert.equal(text.status, 400, show(text));
  const broken = await as('ShopOwner').upload(`/api/plots/${P}/images`, { kind: 'gallery' },
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]));
  assert.equal(broken.status, 400, show(broken));
  assert.match(broken.body.error, /couldn't be read/);
  const small = await upload('ShopOwner', 'gallery', await picture(400, 300));
  assert.equal(small.status, 400, show(small));
  assert.match(small.body.error, /at least 640 by 360/);
  const huge = await upload('ShopOwner', 'gallery', Buffer.alloc(11 * 1024 * 1024));
  assert.equal(huge.status, 413, show(huge));
  const kind = await upload('ShopOwner', 'banner');
  assert.equal(kind.status, 400, show(kind));
  assert.equal((await upload('ModTester', 'gallery', null, 'corridors-4')).status, 409, 'a vacant plot');
});

test('icons: square, one per shop, shown in the plot list', async () => {
  const first = await upload('ModTester', 'icon', await picture(300, 200, '#c33'));
  assert.equal(first.status, 201, show(first));
  const meta = await sharp(Buffer.from(await (await fetchFile(first.body.url)).arrayBuffer())).metadata();
  assert.deepEqual([meta.width, meta.height], [128, 128], 'cut to a square');

  const second = await upload('ModTester', 'icon', await picture(128, 128, '#3c3'));
  assert.equal((await detail(null)).icon, second.body.url, 'the new one replaces it');
  assert.equal((await fetchFile(first.body.url)).status, 404, 'and the old file is gone');
  const listed = (await as(null).get('/api/plots')).body.find((p) => p.id === P);
  assert.equal(listed.shop.icon, second.body.url);

  // The owner's new icon replaces their earlier one still waiting.
  const a = await upload('ShopOwner', 'icon', await picture(100, 100));
  const b = await upload('ShopOwner', 'icon', await picture(100, 100));
  assert.deepEqual((await detail('ShopOwner')).pending_images.map((i) => i.id), [b.body.id]);
  assert.equal((await fetchFile(a.body.url)).status, 404);
  assert.equal((await as('ModTester').post(`/api/images/${b.body.id}/approve`)).status, 200);
  assert.equal((await detail(null)).icon, b.body.url);
  assert.equal((await fetchFile(second.body.url)).status, 404, 'approving replaces the old icon too');
  assert.equal((await upload('ShopOwner', 'icon', await picture(40, 40))).status, 400, 'at least 64 by 64');
});

test('the cover: picked from the gallery by the owner, with a crop', async () => {
  const crop = { x: 0, y: 0.25, w: 1, h: 0.4 };
  assert.equal((await as('Tester').put(`/api/plots/${P}/cover`, { image_id: pendingId, crop })).status, 403);
  const r = await as('ShopOwner').put(`/api/plots/${P}/cover`, { image_id: pendingId, crop });
  assert.equal(r.status, 200, show(r));
  assert.deepEqual((await detail(null)).cover, { image_id: pendingId, crop });

  const bad = [{ x: 0.5, y: 0, w: 0.6, h: 0.5 }, { x: 0, y: 0, w: 0, h: 0.5 }, { x: '0', y: 0, w: 1, h: 1 }, null];
  for (const c of bad) assert.equal((await as('ShopOwner').put(`/api/plots/${P}/cover`, { image_id: pendingId, crop: c })).status, 400, JSON.stringify(c));
  const theirs = await upload('ModTester', 'gallery', null, OTHER);
  assert.equal((await as('ModTester').put(`/api/plots/${P}/cover`, { image_id: theirs.body.id, crop })).status, 400, "another shop's image");
  const waiting = await upload('ShopOwner');
  assert.equal((await as('ShopOwner').put(`/api/plots/${P}/cover`, { image_id: waiting.body.id, crop })).status, 400, 'not approved yet');

  // Deleting the cover image leaves the card without one.
  assert.equal((await as('ShopOwner').delete(`/api/images/${pendingId}`)).status, 200);
  assert.equal((await detail(null)).cover, null);
  const again = (await detail(null)).images[0].id;
  await as('ShopOwner').put(`/api/plots/${P}/cover`, { image_id: again, crop });
  assert.equal((await as('ShopOwner').put(`/api/plots/${P}/cover`, { image_id: null })).status, 200);
  assert.equal((await detail(null)).cover, null, 'and it can be removed');
  assert.ok(modLog('image.cover').length >= 3);
});

test('limits: 10 screenshots a shop, 20 uploads a day, 10 waiting', async () => {
  const db = writeDb(server);
  const shop = (plot) => db.prepare('SELECT id FROM shops WHERE plot_id = ? AND closed_at IS NULL').pluck().get(plot);
  const add = db.prepare('INSERT INTO images (shop_id, kind, status, url, account_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 9; i++) add.run(shop(OTHER), 'gallery', 'approved', '/x', null, '2026-01-01 00:00:00'); // with ModTester's: 10
  db.close();
  const full = await upload('ModTester', 'gallery', null, OTHER);
  assert.equal(full.status, 409, show(full));
  assert.match(full.body.error, /10 screenshots already/);

  // ShopOwner: 10 waiting already, then 20 uploads today.
  const db2 = writeDb(server);
  const add2 = db2.prepare('INSERT INTO images (shop_id, kind, status, url, account_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const owner = db2.prepare('SELECT id FROM accounts WHERE name = ?').pluck().get('ShopOwner');
  const own = db2.prepare('SELECT id FROM shops WHERE plot_id = ? AND closed_at IS NULL').pluck().get(P);
  db2.prepare("DELETE FROM images WHERE shop_id = ? AND status = 'pending'").run(own);
  for (let i = 0; i < 10; i++) add2.run(own, 'icon', 'pending', '/y', owner, '2026-01-01 00:00:00');
  db2.close();
  const waiting = await upload('ShopOwner');
  assert.equal(waiting.status, 409, show(waiting));
  assert.match(waiting.body.error, /waiting for review/);

  const db3 = writeDb(server);
  db3.prepare("DELETE FROM images WHERE url = '/y'").run();
  for (let i = 0; i < 20; i++) {
    db3.prepare("INSERT INTO images (shop_id, kind, status, url, account_id, created_at) VALUES (?, 'icon', 'approved', '/z', ?, CURRENT_TIMESTAMP)").run(own, owner);
  }
  db3.close();
  const daily = await upload('ShopOwner');
  assert.equal(daily.status, 409, show(daily));
  assert.match(daily.body.error, /a day/);
});
