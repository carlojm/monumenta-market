// The admin plot editor (PUT /api/plots/:id/shop, POST /api/plots/:id/vacate):
// every save is a revision (3.2b), with the same answers as before.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN_TOKEN, startServer } from './helpers/server.js';
import { apiFor, readDb, show } from './helpers/api.js';

let server, as, P, EMPTY, tags;
before(async () => {
  server = await startServer();
  as = apiFor(server);
  const plots = (await as(null).get('/api/plots')).body;
  P = plots.filter((p) => p.shop)[20].id;
  EMPTY = plots.find((p) => !p.shop).id;
  tags = (await as(null).get('/api/tags')).body.tags.map((t) => t.id);
});
after(() => server.stop());

const shop = async (id) => (await as(null).get(`/api/plots/${id}`)).body.shop;
const form = (s) => ({ owner: s.owner, shop_name: s.shop_name ?? '', guild_name: s.guild_name ?? '', description: s.description ?? '',
  stock: s.stock ?? '', palette: s.palette ?? '', guild_color: s.guild_color ?? '', primary_color: s.primary_color ?? '',
  secondary_color: s.secondary_color ?? '', tag_ids: s.tags.map((t) => t.id) });
const put = (id, body, headers) => as(headers ? null : 'ModTester').put(`/api/plots/${id}/shop`, body, headers);

test('edits, renames and owner changes', async () => {
  let s = await shop(P);
  let r = await put(P, { ...form(s), rename: false });
  assert.ok(r.status === 200 && r.body.updated === false, `no changes: ${show(r)}`);
  r = await put(P, { ...form(s), description: 'Admin edit', tag_ids: [...form(s).tag_ids, tags[5]], rename: false });
  assert.deepEqual(r.body.updated, ['description', 'tags'], show(r));
  s = await shop(P);
  assert.ok(s.description === 'Admin edit' && s.tags.some((t) => t.id === tags[5]), 'the page shows it');

  r = await put(P, { ...form(s), owner: `${s.owner}x`, rename: true });
  const renamed = await shop(P);
  assert.ok(r.status === 200 && renamed.id === s.id && renamed.owner === `${s.owner}x`, `a rename keeps the shop: ${show(r)}`);
  assert.equal((await put(P, { ...form(renamed), owner: '  ', rename: false })).status, 400, 'blank owner');
  assert.equal((await put(P, { ...form(renamed), description: 'y'.repeat(4001) })).status, 400, 'over the length limit');

  r = await put(P, { ...form(renamed), owner: 'NewAdminOwner', rename: false });
  const opened = await shop(P);
  assert.ok(r.status === 201 && r.body.closed === s.id && r.body.opened === opened.id && opened.owner === 'NewAdminOwner',
    `an owner change opens a new shop: ${show(r)}`);
  assert.equal(opened.description, 'Admin edit', 'starting from the submitted form');
});

test('a new shop on an empty plot, and closing it', async () => {
  assert.equal((await put(EMPTY, { owner: '' })).status, 400, 'no owner');
  let r = await put(EMPTY, { owner: 'FreshOwner', description: 'Brand new', tag_ids: [tags[0]] });
  const fresh = await shop(EMPTY);
  assert.ok(r.status === 201 && r.body.opened && !r.body.closed && fresh.stock === null && fresh.tags.length === 1, show(r));
  r = await as('ModTester').post(`/api/plots/${EMPTY}/vacate`);
  assert.ok(r.status === 200 && r.body.closed === fresh.id && (await shop(EMPTY)) === null, show(r));
  assert.equal((await as('ModTester').post(`/api/plots/${EMPTY}/vacate`)).status, 409, 'closing twice');
});

test('every save is a revision', () => {
  const db = readDb(server);
  const rows = db.prepare('SELECT action, direct, status FROM revisions WHERE plot_id IN (?, ?)').all(P, EMPTY);
  db.close();
  assert.ok(rows.length >= 5 && rows.every((r) => r.direct === 1 && r.status === 'approved'), JSON.stringify(rows));
});

test('the emergency ADMIN_TOKEN (no account) still works', async () => {
  const r = await put(P, { ...form(await shop(P)), stock: 'via emergency token' }, { Authorization: `Bearer ${ADMIN_TOKEN}` });
  assert.ok(r.status === 200 && (await shop(P)).stock === 'via emergency token', show(r));
  assert.equal((await put(P, { stock: 'x' }, { Authorization: 'Bearer wrong-token' })).status, 401, 'a wrong token');
});
