// Shop images (3.11): uploads re-encoded to WebP, review by the owner,
// maintainers or staff, the icon, the cover and the limits. Files go to the
// test server's own folder (lib/imageStore.js), never to real storage.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { startServer } from './helpers/server.js';
import { apiFor, readDb, show, writeDb } from './helpers/api.js';

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

test('logged out: no uploads', async () => {
  const r = await upload(null);
  assert.equal(r.status, 401, show(r));
});

let pendingId;
test("a player's screenshot waits for review, and is a clean WebP", async () => {
  // A phone photo with its location in it.
  const jpg = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#a74' } })
    .withExif({ IFD0: { Make: 'PhoneCo' }, IFD3: { GPSLatitude: '40/1 26/1 46/1', GPSLatitudeRef: 'N' } }).jpeg().toBuffer();
  const r = await as('Tester').upload(`/api/plots/${P}/images`, { kind: 'gallery' }, jpg, 'photo.jpg');
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
  assert.deepEqual((await detail('Tester')).pending_images.map((i) => i.id), [pendingId], 'the uploader sees theirs');
  assert.deepEqual((await detail('ShopOwner')).pending_images.map((i) => i.id), [pendingId], 'the owner sees it');
  assert.deepEqual((await detail('Player2')).pending_images, [], 'other players do not');
  assert.equal(modLog('image.suggest').length, 1);
});

test('the review queue: staff see every shop, owners see theirs', async () => {
  const mine = (await as('ShopOwner').get('/api/images/pending')).body;
  assert.deepEqual(mine.map((i) => [i.id, i.plot_id, i.uploader]), [[pendingId, P, 'Tester']]);
  assert.equal((await as('ModTester').get('/api/images/pending')).body.length, 1);
  assert.deepEqual((await as('Player2').get('/api/images/pending')).body, []);
});

test('only the owner, maintainers or staff approve', async () => {
  assert.equal((await as('Player2').post(`/api/images/${pendingId}/approve`)).status, 403);
  assert.equal((await as('Tester').post(`/api/images/${pendingId}/approve`)).status, 403, 'not your own either');
  const r = await as('ShopOwner').post(`/api/images/${pendingId}/approve`);
  assert.equal(r.status, 200, show(r));
  assert.deepEqual((await detail(null)).images.map((i) => [i.id, i.uploader]), [[pendingId, 'Tester']]);
  assert.equal((await as('ShopOwner').post(`/api/images/${pendingId}/approve`)).status, 409, 'already reviewed');
});

test("the owner's own upload is live at once", async () => {
  const r = await upload('ShopOwner');
  assert.equal(r.status, 201, show(r));
  assert.equal(r.body.status, 'approved');
  assert.equal((await detail(null)).images.length, 2);
  assert.equal(modLog('image.add').length, 1);
});

test('rejecting deletes the upload and its files', async () => {
  const r = await upload('Player2');
  const reject = await as('ModTester').post(`/api/images/${r.body.id}/reject`);
  assert.equal(reject.status, 200, show(reject));
  assert.equal((await fetchFile(r.body.url)).status, 404);
  assert.equal((await fetchFile(r.body.card_url)).status, 404);
  assert.equal((await detail('Player2')).pending_images.length, 0);
});

test('the uploader can withdraw a pending one, but not delete an approved one', async () => {
  const r = await upload('Player2');
  assert.equal((await as('Tester').delete(`/api/images/${r.body.id}`)).status, 403, "someone else's");
  assert.equal((await as('Player2').delete(`/api/images/${r.body.id}`)).status, 200);
  assert.equal((await as('Tester').delete(`/api/images/${pendingId}`)).status, 403, 'approved: the owner or staff decide');
  assert.equal(modLog('image.withdraw').length, 1);
});

test('only real images of a usable size get in', async () => {
  const text = await as('Tester').upload(`/api/plots/${P}/images`, { kind: 'gallery' }, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg');
  assert.equal(text.status, 400, show(text));
  const broken = await as('Tester').upload(`/api/plots/${P}/images`, { kind: 'gallery' },
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]));
  assert.equal(broken.status, 400, show(broken));
  assert.match(broken.body.error, /couldn't be read/);
  const small = await upload('Tester', 'gallery', await picture(400, 300));
  assert.equal(small.status, 400, show(small));
  assert.match(small.body.error, /at least 640 by 360/);
  const huge = await upload('Tester', 'gallery', Buffer.alloc(11 * 1024 * 1024));
  assert.equal(huge.status, 413, show(huge));
  const kind = await upload('Tester', 'banner');
  assert.equal(kind.status, 400, show(kind));
  assert.equal((await upload('Tester', 'gallery', null, 'corridors-4')).status, 409, 'a vacant plot');
});

test('icons: square, one per shop, shown in the plot list', async () => {
  const first = await upload('ShopOwner', 'icon', await picture(300, 200, '#c33'));
  assert.equal(first.status, 201, show(first));
  const meta = await sharp(Buffer.from(await (await fetchFile(first.body.url)).arrayBuffer())).metadata();
  assert.deepEqual([meta.width, meta.height], [128, 128], 'cut to a square');

  const second = await upload('ShopOwner', 'icon', await picture(128, 128, '#3c3'));
  assert.equal((await detail(null)).icon, second.body.url, 'the new one replaces it');
  assert.equal((await fetchFile(first.body.url)).status, 404, 'and the old file is gone');
  const listed = (await as(null).get('/api/plots')).body.find((p) => p.id === P);
  assert.equal(listed.shop.icon, second.body.url);

  // A player's new suggestion replaces their earlier one.
  const a = await upload('Tester', 'icon', await picture(100, 100));
  const b = await upload('Tester', 'icon', await picture(100, 100));
  assert.deepEqual((await detail('Tester')).pending_images.map((i) => i.id), [b.body.id]);
  assert.equal((await fetchFile(a.body.url)).status, 404);
  assert.equal((await as('ShopOwner').post(`/api/images/${b.body.id}/approve`)).status, 200);
  assert.equal((await detail(null)).icon, b.body.url);
  assert.equal((await fetchFile(second.body.url)).status, 404, 'approving replaces the old icon too');
  assert.equal((await upload('Tester', 'icon', await picture(40, 40))).status, 400, 'at least 64 by 64');
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
  const icon = (await detail('ShopOwner')).icon;
  assert.ok(icon);

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
  const shop = db.prepare('SELECT id FROM shops WHERE plot_id = ? AND closed_at IS NULL').pluck().get(OTHER);
  const add = db.prepare("INSERT INTO images (shop_id, kind, status, url, account_id, created_at) VALUES (?, 'gallery', ?, '/x', ?, ?)");
  for (let i = 0; i < 9; i++) add.run(shop, 'approved', null, '2026-01-01 00:00:00'); // with ModTester's: 10
  db.close();
  const full = await upload('ShopOwner', 'gallery', null, OTHER);
  assert.equal(full.status, 409, show(full));
  assert.match(full.body.error, /10 screenshots already/);

  const db2 = writeDb(server);
  const accountId = (name) => db2.prepare('SELECT id FROM accounts WHERE name = ?').pluck().get(name);
  db2.prepare("DELETE FROM images WHERE url = '/x'").run();
  for (let i = 0; i < 10; i++) db2.prepare("INSERT INTO images (shop_id, kind, status, url, account_id, created_at) VALUES (?, 'icon', 'pending', '/y', ?, '2026-01-01 00:00:00')").run(shop, accountId('Player2'));
  for (let i = 0; i < 20; i++) db2.prepare("INSERT INTO images (shop_id, kind, status, url, account_id, created_at) VALUES (?, 'icon', 'approved', '/z', ?, CURRENT_TIMESTAMP)").run(shop, accountId('Tester'));
  db2.close();
  const waiting = await upload('Player2', 'gallery', null, OTHER);
  assert.equal(waiting.status, 409, show(waiting));
  assert.match(waiting.body.error, /waiting for review/);
  const daily = await upload('Tester', 'gallery', null, OTHER);
  assert.equal(daily.status, 409, show(daily));
  assert.match(daily.body.error, /a day/);
});
