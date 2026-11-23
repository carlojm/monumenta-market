// Your edits (3.14): GET /api/revisions/mine, your own edits newest first,
// with how each was reviewed. Withdrawn ones come separately.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer } from './helpers/server.js';
import { apiFor, edit, show, snapshot } from './helpers/api.js';

let server, as;
before(async () => { server = await startServer(); as = apiFor(server); });
after(() => server.stop());

const P = 'corridors-2'; // ShopOwner's
const mine = async (name, query = '') => (await as(name).get(`/api/revisions/mine${query}`)).body;
const find = async (name, id) => (await mine(name)).edits.find((e) => e.id === id) ?? (await mine(name, '?withdrawn=1')).edits.find((e) => e.id === id);

test('only for you, and only yours', async () => {
  assert.equal((await as(null).get('/api/revisions/mine')).status, 401);
  const r = await edit(as, 'Tester', P, { palette: 'theirs' });
  assert.ok(!(await find('Player2', r.body.id)), "other players don't see it");
  assert.ok(!(await find('ModTester', r.body.id)), 'nor do staff, in their own list');
  await as('Tester').post(`/api/revisions/${r.body.id}/withdraw`);
});

test('a pending suggestion, then rejected with a reason', async () => {
  const before = await snapshot(as, P);
  const r = await edit(as, 'Tester', P, { palette: 'P1' }, { summary: 'saw it today' });
  let e = (await mine('Tester')).edits[0];
  assert.equal(e.id, r.body.id, 'newest first');
  assert.ok(e.status === 'pending' && e.direct === false && e.plot_id === P && e.action === 'edit' && e.shop, JSON.stringify(e));
  assert.deepEqual(e.changes, [{ field: 'palette', from: before.palette, to: 'P1' }]);
  assert.ok(e.summary === 'saw it today' && e.reviewer === null && e.adjusted.length === 0);
  await as('ShopOwner').post(`/api/revisions/${r.body.id}/reject`, { note: 'That palette is wrong' });
  e = await find('Tester', r.body.id);
  assert.ok(e.status === 'rejected' && e.review_note === 'That palette is wrong' && e.reviewer === 'ShopOwner' && e.reviewed_at, JSON.stringify(e));
  assert.equal(e.changes[0].to, 'P1', 'still shows what was asked');
});

test('approved: with a fix by the reviewer, and as-is', async () => {
  let r = await edit(as, 'Tester', P, { description: 'Typo heer', palette: 'Q' });
  await as('ShopOwner').post(`/api/revisions/${r.body.id}/approve`, { values: { description: 'Typo here' }, note: 'Fixed a typo' });
  let e = await find('Tester', r.body.id);
  assert.ok(e.status === 'approved' && e.review_note === 'Fixed a typo' && e.reviewer === 'ShopOwner');
  assert.equal(e.changes.find((c) => c.field === 'description')?.to, 'Typo here', 'changes are what was saved');
  assert.deepEqual(e.adjusted, [{ field: 'description', suggested: 'Typo heer', saved: 'Typo here' }]);
  r = await edit(as, 'Tester', P, { palette: 'R' });
  await as('ShopOwner').post(`/api/revisions/${r.body.id}/approve`, {});
  e = await find('Tester', r.body.id);
  assert.ok(e.status === 'approved' && e.adjusted.length === 0);
});

test('withdrawn ones come separately, with a count', async () => {
  const r = await edit(as, 'Tester', P, { palette: 'W' });
  await as('Tester').post(`/api/revisions/${r.body.id}/withdraw`);
  const main = await mine('Tester');
  assert.ok(!main.edits.some((e) => e.id === r.body.id) && main.edits.every((e) => e.status !== 'withdrawn'));
  const w = await mine('Tester', '?withdrawn=1');
  assert.ok(w.edits[0]?.id === r.body.id && w.edits.every((e) => e.status === 'withdrawn'));
  assert.equal(main.withdrawn, w.edits.length);
});

test("an owner's Force edit has no reviewer", async () => {
  const r = await edit(as, 'ShopOwner', P, { palette: 'F' });
  const e = await find('ShopOwner', r.body.id);
  assert.ok(e.direct === true && e.status === 'approved' && e.reviewer === null && e.changes[0]?.to === 'F', JSON.stringify(e));
});

test('a new shop, approved with a fixed owner', async () => {
  const empty = (await as(null).get('/api/plots')).body.find((p) => !p.shop).id;
  const r = await as('Tester').post(`/api/plots/${empty}/revisions`, { action: 'open', proposed: { owner: 'Ownr', shop_name: 'Fresh', tag_ids: [] } });
  await as('ModTester').post(`/api/revisions/${r.body.id}/approve`, { values: { owner: 'Owner' } });
  const e = await find('Tester', r.body.id);
  assert.ok(e.action === 'open' && e.owner === 'Owner', JSON.stringify(e));
  assert.deepEqual(e.adjusted, [{ field: 'owner', suggested: 'Ownr', saved: 'Owner' }]);
});

test('20 a page', async () => {
  for (let i = 0; i < 21; i++) await edit(as, 'AdminTester', 'corridors-1', { palette: `page ${i}` });
  const p1 = await mine('AdminTester');
  assert.ok(p1.edits.length === 20 && p1.hasMore, `${p1.edits.length} ${p1.hasMore}`);
  const p2 = await mine('AdminTester', '?offset=20');
  assert.ok(p2.edits.length === 1 && !p2.hasMore && !p1.edits.some((e) => e.id === p2.edits[0].id), show({ status: 200, body: p2 }));
  assert.equal((await mine('AdminTester', '?offset=abc')).edits[0].id, p1.edits[0].id, 'a bad offset counts as 0');
});
