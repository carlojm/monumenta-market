// Shop images (3.11): uploads re-encoded to WebP, saved as the uploader's
// draft; they reach the card only through an edit. The owner, maintainers
// and staff change a shop's images; an edit adding one waits for a moderator
// unless a moderator made it. Files go to the test server's own folder
// (lib/imageStore.js), never to real storage.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { startServer } from './helpers/server.js';
import { apiFor, edit, readDb, show, snapshot, writeDb } from './helpers/api.js';

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
const statusOf = (id) => {
  const db = readDb(server);
  try { return db.prepare('SELECT status FROM images WHERE id = ?').pluck().get(id) ?? 'gone'; } finally { db.close(); }
};
// Adds screenshots (and maybe sets the icon) on the page as it is now.
const addImages = async (name, ids, extra = {}, icon) => {
  const base = await snapshot(as, P);
  return edit(as, name, P, { image_ids: [...base.image_ids, ...ids], ...(icon !== undefined && { icon_id: icon }) }, extra);
};

test('only the owner, maintainers and staff upload, and an upload is a draft', async () => {
  assert.equal((await upload(null)).status, 401);
  const player = await upload('Tester');
  assert.equal(player.status, 403, show(player));
  assert.match(player.body.error, /owner, its maintainers or a moderator/);
  const r = await upload('ModTester');
  assert.equal(r.status, 201, show(r));
  assert.equal(r.body.status, 'draft');
  assert.equal((await detail(null)).images.length, 0, "even a moderator's upload isn't on the card yet");
});

test('a clean WebP: no EXIF, and a smaller copy for the card', async () => {
  // A phone photo with its location in it.
  const jpg = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#a74' } })
    .withExif({ IFD0: { Make: 'PhoneCo' }, IFD3: { GPSLatitude: '40/1 26/1 46/1', GPSLatitudeRef: 'N' } }).jpeg().toBuffer();
  const r = await as('ShopOwner').upload(`/api/plots/${P}/images`, { kind: 'gallery' }, jpg, 'photo.jpg');
  assert.equal(r.status, 201, show(r));
  const meta = await sharp(Buffer.from(await (await fetchFile(r.body.url)).arrayBuffer())).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.exif, undefined, 'no EXIF (location, camera) left');
  assert.deepEqual([meta.width, meta.height], [1600, 900]);
  const card = await sharp(Buffer.from(await (await fetchFile(r.body.card_url)).arrayBuffer())).metadata();
  assert.equal(card.width, 960);
  // Taking it back out of the form; only the uploader can.
  assert.equal((await as('ModTester').delete(`/api/images/${r.body.id}`)).status, 404);
  assert.equal((await as('ShopOwner').delete(`/api/images/${r.body.id}`)).status, 200);
  assert.equal((await fetchFile(r.body.url)).status, 404);
});

let ownersId;
test("the owner's new screenshot goes in an edit that waits for a moderator", async () => {
  ownersId = (await upload('ShopOwner')).body.id;
  // Force edit (no request_review): adding an image still waits.
  const r = await addImages('ShopOwner', [ownersId]);
  assert.equal(r.status, 201, show(r));
  assert.equal(r.body.status, 'pending');
  assert.equal(statusOf(ownersId), 'pending', 'no longer an unsent draft');
  assert.equal((await detail(null)).images.length, 0, 'not on the card yet');

  const [pending] = (await as('ModTester').get('/api/revisions/pending')).body;
  assert.deepEqual(pending.images.added.map((i) => i.id), [ownersId], 'the reviewer sees the picture');
  assert.equal(pending.can_review, true);
  const own = (await as('ShopOwner').get('/api/revisions/pending')).body[0];
  assert.equal(own.can_review, false, 'the owner can see it but not approve it');
  assert.equal((await as('ShopOwner').post(`/api/revisions/${pending.id}/approve`)).status, 403);

  const ok = await as('ModTester').post(`/api/revisions/${pending.id}/approve`);
  assert.equal(ok.status, 200, show(ok));
  assert.deepEqual((await detail(null)).images.map((i) => [i.id, i.uploader]), [[ownersId, 'ShopOwner']]);
  const listed = (await as(null).get('/api/plots')).body.find((p) => p.id === P);
  assert.equal(listed.shop.image_count, 1, 'the list counts it');
  const [entry] = (await as(null).get(`/api/plots/${P}/history`)).body.changes;
  assert.deepEqual(entry.images.added.map((i) => i.id), [ownersId], 'and history shows it');
});

test("a moderator's own edit with a new screenshot is live at once", async () => {
  const id = (await upload('ModTester')).body.id;
  const r = await addImages('ModTester', [id]);
  assert.equal(r.status, 201, show(r));
  assert.equal(r.body.status, 'approved');
  assert.deepEqual((await detail(null)).images.map((i) => i.id), [ownersId, id]);
});

test('the owner removes a screenshot with a Force edit, and can undo it', async () => {
  const before = await snapshot(as, P);
  const [kept, dropped] = before.image_ids;
  const r = await edit(as, 'ShopOwner', P, { image_ids: [kept] });
  assert.equal(r.status, 201, show(r));
  assert.equal(r.body.status, 'approved', 'removing needs no review');
  assert.deepEqual((await detail(null)).images.map((i) => i.id), [kept]);
  assert.equal(statusOf(dropped), 'removed', 'kept for history and undo');
  const undo = await as('ShopOwner').post(`/api/revisions/${r.body.id}/undo`);
  assert.equal(undo.status, 201, show(undo));
  assert.deepEqual((await detail(null)).images.map((i) => i.id), [kept, dropped], 'back, in its place');
});

test('rejecting, withdrawing or replacing a suggestion deletes its new images', async () => {
  const first = (await upload('ShopOwner')).body;
  const one = await addImages('ShopOwner', [first.id], { request_review: true });
  assert.equal(one.body.status, 'pending');
  const second = (await upload('ShopOwner')).body;
  const two = await addImages('ShopOwner', [second.id], { request_review: true });
  assert.equal(two.body.replaced, 1);
  assert.equal(statusOf(first.id), 'gone', 'the replaced suggestion took its image with it');
  assert.equal((await fetchFile(first.url)).status, 404);

  const reject = await as('ModTester').post(`/api/revisions/${two.body.id}/reject`, { note: 'Not a screenshot' });
  assert.equal(reject.status, 200, show(reject));
  assert.equal(statusOf(second.id), 'gone');
  assert.equal((await fetchFile(second.card_url)).status, 404);

  const third = (await upload('ShopOwner')).body;
  const three = await addImages('ShopOwner', [third.id]);
  assert.equal((await as('ShopOwner').post(`/api/revisions/${three.body.id}/withdraw`)).status, 200);
  assert.equal(statusOf(third.id), 'gone');
});

test("an edit can only add your own drafts, and only the shop's people change images", async () => {
  const mods = (await upload('ModTester')).body.id;
  const r = await addImages('ShopOwner', [mods]);
  assert.equal(r.status, 400, show(r));
  assert.match(r.body.error, /no longer there/);
  const player = await addImages('Tester', [mods]);
  assert.equal(player.status, 403, show(player));
  const icon = (await upload('ModTester', 'icon', await picture(128, 128))).body.id;
  assert.equal((await addImages('ModTester', [icon])).status, 400, 'an icon is not a screenshot');
  // A player's text edit leaves the images alone.
  const text = await edit(as, 'Tester', P, { palette: 'Moss and stone' });
  assert.equal(text.status, 201, show(text));
  assert.equal((await as('Tester').post(`/api/revisions/${text.body.id}/withdraw`)).status, 200);
});

test('icons: suggested by the owner, approved by a moderator, replaced later', async () => {
  const first = (await upload('ShopOwner', 'icon', await picture(300, 200, '#c33'))).body;
  const meta = await sharp(Buffer.from(await (await fetchFile(first.url)).arrayBuffer())).metadata();
  assert.deepEqual([meta.width, meta.height], [128, 128], 'cut to a square');
  const r = await addImages('ShopOwner', [], {}, first.id);
  assert.equal(r.body.status, 'pending', show(r));
  const pending = (await as('ModTester').get('/api/revisions/pending')).body.find((x) => x.id === r.body.id);
  assert.equal(pending.icon.to.id, first.id);
  assert.equal((await as('ModTester').post(`/api/revisions/${r.body.id}/approve`)).status, 200);
  assert.equal((await detail(null)).icon, first.url);
  assert.equal((await as(null).get('/api/plots')).body.find((p) => p.id === P).shop.icon, first.url);

  const second = (await upload('ModTester', 'icon', await picture(128, 128, '#3c3'))).body;
  assert.equal((await addImages('ModTester', [], {}, second.id)).body.status, 'approved');
  assert.equal((await detail(null)).icon_id, second.id);
  assert.equal(statusOf(first.id), 'removed');
  // Taking the icon off is a Force edit for the owner.
  const off = await addImages('ShopOwner', [], {}, null);
  assert.equal(off.body.status, 'approved', show(off));
  assert.equal((await detail(null)).icon, null);
});

test("a 16x16 item texture becomes a crisp 128x128 icon", async () => {
  // Left half red, right half blue: after enlarging, the line between them
  // is still one pixel sharp, with no blended colors.
  const item = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#ff0000' } })
    .composite([{ input: { create: { width: 8, height: 16, channels: 3, background: '#0000ff' } }, left: 8, top: 0 }])
    .png().toBuffer();
  const r = await upload('ShopOwner', 'icon', item);
  assert.equal(r.status, 201, show(r));
  const { data, info } = await sharp(Buffer.from(await (await fetchFile(r.body.url)).arrayBuffer())).raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [128, 128]);
  const at = (x) => [...data.subarray(x * info.channels, x * info.channels + 3)];
  assert.deepEqual(at(63), [255, 0, 0]);
  assert.deepEqual(at(64), [0, 0, 255]);
});

test('only real images of a usable size get in', async () => {
  const text = await as('ShopOwner').upload(`/api/plots/${P}/images`, { kind: 'gallery' }, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg');
  assert.equal(text.status, 400, show(text));
  const broken = await as('ShopOwner').upload(`/api/plots/${P}/images`, { kind: 'gallery' },
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]));
  assert.equal(broken.status, 400, show(broken));
  assert.match(broken.body.error, /couldn't be read/);
  const small = await upload('ShopOwner', 'gallery', await picture(400, 300));
  assert.match(small.body.error, /at least 640 by 360/);
  assert.match((await upload('ShopOwner', 'icon', await picture(12, 12))).body.error, /at least 16 by 16/);
  const huge = await upload('ShopOwner', 'gallery', Buffer.alloc(11 * 1024 * 1024));
  assert.equal(huge.status, 413, show(huge));
  assert.equal((await upload('ShopOwner', 'banner')).status, 400);
  assert.equal((await upload('ModTester', 'gallery', null, 'corridors-4')).status, 409, 'a vacant plot');
});

test('the banner color is a real color; older words stay until changed', async () => {
  const word = await edit(as, 'ShopOwner', P, { primary_color: 'light blue' });
  assert.equal(word.status, 400, show(word));
  assert.match(word.body.error, /banner color must be a color/);
  const hex = await edit(as, 'ShopOwner', P, { primary_color: '#3a7bd5' });
  assert.equal(hex.status, 201, show(hex));
  assert.equal((await detail(null)).primary_color, '#3a7bd5');
  const db = writeDb(server);
  db.prepare("UPDATE shops SET primary_color = 'rouge' WHERE plot_id = ? AND closed_at IS NULL").run(OTHER);
  db.close();
  const other = await edit(as, 'ModTester', OTHER, { palette: 'Red' });
  assert.equal(other.status, 201, `an old word doesn't block other edits: ${show(other)}`);
});

test('limits: 10 screenshots a shop, 20 uploads a day', async () => {
  const now = await snapshot(as, P);
  const db = writeDb(server);
  const owner = db.prepare('SELECT id FROM accounts WHERE name = ?').pluck().get('ShopOwner');
  const shop = db.prepare('SELECT id FROM shops WHERE plot_id = ? AND closed_at IS NULL').pluck().get(P);
  const add = db.prepare("INSERT INTO images (shop_id, kind, status, url, account_id, created_at) VALUES (?, 'gallery', 'draft', '/x', ?, CURRENT_TIMESTAMP)");
  const drafts = Array.from({ length: 11 - now.image_ids.length }, () => Number(add.run(shop, owner).lastInsertRowid));
  db.close();
  const full = await addImages('ShopOwner', drafts);
  assert.equal(full.status, 400, show(full));
  assert.match(full.body.error, /at most 10 screenshots/);
  // 20 uploads today already (the inserted ones count too).
  const db2 = writeDb(server);
  const more = db2.prepare("INSERT INTO images (shop_id, kind, status, url, account_id, created_at) VALUES (?, 'gallery', 'draft', '/z', ?, CURRENT_TIMESTAMP)");
  for (let i = 0; i < 20; i++) more.run(shop, owner);
  db2.close();
  const daily = await upload('ShopOwner');
  assert.equal(daily.status, 409, show(daily));
  assert.match(daily.body.error, /a day/);
});
