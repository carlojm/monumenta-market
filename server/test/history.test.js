// A plot's history (3.9): GET /api/plots/:id/history. Public, saved changes
// only, newest first, with older Update lines at the end.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer } from './helpers/server.js';
import { apiFor, edit, show, snapshot, writeDb } from './helpers/api.js';

let server, as;
before(async () => { server = await startServer(); as = apiFor(server); });
after(() => server.stop());

const P = 'corridors-2'; // ShopOwner's
const history = async (plot, query = '') => (await as(null).get(`/api/plots/${plot}/history${query}`)).body;
let forced;

test('anyone can read it; an unknown plot is a 404', async () => {
  const r = await as(null).get(`/api/plots/${P}/history`);
  assert.equal(r.status, 200, show(r));
  assert.deepEqual(r.body.changes, [], 'nothing saved yet');
  assert.equal((await as(null).get('/api/plots/nowhere-9/history')).status, 404);
});

test('older Update lines come at the end, as earlier changes', async () => {
  // From before revisions existed: written straight to the card's log.
  const db = writeDb(server);
  const shop = db.prepare('SELECT id FROM shops WHERE plot_id = ? AND closed_at IS NULL').pluck().get(P);
  db.prepare("INSERT INTO comments (shop_id, author, body, is_system, status, created_at) VALUES (?, 'carlo_m', ?, 1, 'approved', '2026-11-01 12:00:00')")
    .run(shop, 'description updated from "a" to "b"');
  db.close();
  const { earlier } = await history(P);
  assert.equal(earlier.length, 1);
  assert.deepEqual({ ...earlier[0], id: undefined }, {
    id: undefined, body: 'description updated from "a" to "b"', author: 'carlo_m', created_at: '2026-11-01 12:00:00', shop: 'ShopOwner',
  });
});

test('only saved changes, newest first, with who, when and what', async () => {
  forced = (await edit(as, 'ShopOwner', P, { palette: 'Forced' }, { summary: 'new blocks' })).body.id;
  const sugg = (await edit(as, 'Tester', P, { stock: 'Slime' }, { summary: 'saw it' })).body.id;
  await as('ShopOwner').post(`/api/revisions/${sugg}/approve`, { note: 'thanks' });
  const rejected = (await edit(as, 'Player2', P, { palette: 'Nope' })).body.id;
  await as('ShopOwner').post(`/api/revisions/${rejected}/reject`, { note: 'not in game' });
  const withdrawn = (await edit(as, 'Tester', 'corridors-2', { stock: 'Changed my mind' })).body.id;
  await as('Tester').post(`/api/revisions/${withdrawn}/withdraw`);
  const pending = (await edit(as, 'Player2', P, { description: 'Waiting' })).body.id;

  const { changes } = await history(P);
  assert.deepEqual(changes.map((c) => c.id), [sugg, forced], 'rejected, withdrawn and pending ones are left out');
  const [a, f] = changes;
  assert.ok(a.author === 'Tester' && a.reviewer === 'ShopOwner' && a.direct === false, JSON.stringify(a));
  assert.ok(a.summary === 'saw it' && a.note === 'thanks' && a.saved_at, 'the summary and the approval note');
  assert.deepEqual(a.changes, [{ field: 'stock', from: null, to: 'Slime' }]);
  assert.ok(f.author === 'ShopOwner' && f.reviewer === null && f.direct === true, 'a Force edit has no reviewer');
  assert.deepEqual(f.changes.map((c) => c.field), ['palette']);
  assert.equal(f.shop, 'ShopOwner');
  assert.ok(!JSON.stringify(changes).includes('not in game'), "a rejection reason isn't public");
  await as('Player2').post(`/api/revisions/${pending}/withdraw`);
});

test('the earlier lines are only those from before the first revision', async () => {
  const { earlier } = await history(P);
  assert.equal(earlier.length, 1, "the new edits' own Update lines aren't repeated there");
});

test('tags by name, and undo', async () => {
  const { tags } = (await as(null).get('/api/tags')).body;
  const r = await edit(as, 'ShopOwner', P, { tag_ids: [tags[0].id] });
  const undo = (await as('ShopOwner').post(`/api/revisions/${r.body.id}/undo`)).body;
  const { changes } = await history(P);
  assert.equal(changes[0].id, undo.id);
  assert.equal(changes[0].summary, `Undo of #${r.body.id}`);
  assert.deepEqual(changes[0].tags, { added: [], removed: [tags[0].name] });
  assert.deepEqual(changes[1].tags, { added: [tags[0].name], removed: [] });
});

test('a move shows on both plots', async () => {
  const [A, B] = (await as(null).get('/api/plots')).body.filter((p) => !p.shop).map((p) => p.id);
  const open = (plot) => as('ModTester').post(`/api/plots/${plot}/revisions`, { action: 'open', proposed: { owner: 'Mover', tag_ids: [] } });
  await open(A);
  await open(B);
  const [onB] = (await history(B)).changes;
  assert.ok(onB.action === 'open' && onB.owner === 'Mover' && onB.moved_from === A, JSON.stringify(onB));
  const [onA] = (await history(A)).changes;
  assert.ok(onA.action === 'vacate' && onA.summary === `Mover moved to ${B}` && onA.part_of === onB.id, JSON.stringify(onA));
});

test('tags added in the admin tag tools are in the history too', async () => {
  const { tags } = (await as(null).get('/api/tags')).body;
  const current = (await as(null).get(`/api/plots/${P}`)).body.shop.tags.map((t) => t.id);
  const tag = tags.find((t) => !current.includes(t.id));
  let r = await as('ModTester').post('/api/admin/tags/auto-apply', { shops: [{ plot_id: P, tag_ids: [tag.id] }] });
  assert.equal(r.status, 200, show(r));
  let [latest] = (await history(P)).changes;
  assert.ok(latest.summary === 'Auto-tagged from the description' && latest.author === 'ModTester', JSON.stringify(latest));
  assert.deepEqual(latest.tags, { added: [tag.name], removed: [] });

  r = await as('Tester').post('/api/tags/suggest', { name: 'Slime blocks', kind: 'category', plot_id: P });
  assert.equal(r.status, 201, show(r));
  r = await as('ModTester').post(`/api/admin/tags/${r.body.id}/approve`, { add_to_shop: true });
  assert.equal(r.status, 200, show(r));
  [latest] = (await history(P)).changes;
  assert.equal(latest.summary, 'Added the suggested tag "Slime blocks" (suggested by Tester)');
  assert.deepEqual(latest.tags.added, ['Slime blocks']);
});

test('20 a page; the earlier lines come with the last page', async () => {
  for (let i = 0; i < 20; i++) await edit(as, 'ShopOwner', P, { palette: `page ${i}` });
  const p1 = await history(P);
  assert.ok(p1.changes.length === 20 && p1.hasMore && !('earlier' in p1), 'no earlier lines yet');
  const p2 = await history(P, '?offset=20');
  assert.ok(!p2.hasMore && p2.earlier.length === 1 && !p2.changes.some((c) => p1.changes.some((d) => d.id === c.id)));
});

test('a deleted account shows as no name', async () => {
  const id = (await edit(as, 'Player2', P, { palette: 'From Player2' })).body.id;
  await as('ShopOwner').post(`/api/revisions/${id}/approve`, {});
  assert.equal((await history(P)).changes[0].author, 'Player2');
  const r = await as('Player2').delete('/api/auth/me', { confirm_name: 'Player2' });
  assert.equal(r.status, 200, show(r));
  const [entry] = (await history(P)).changes;
  assert.ok(entry.id === id && entry.author === null && entry.reviewer === 'ShopOwner', JSON.stringify(entry));
});

test('edits to the current shop carry their version, for Restore', async () => {
  const first = (await edit(as, 'ShopOwner', P, { palette: 'Version one' })).body.id;
  await edit(as, 'ShopOwner', P, { palette: 'Version two' });
  const { changes } = await history(P);
  const entry = changes.find((c) => c.id === first);
  assert.equal(entry.version.palette, 'Version one', 'the page right after that change');
  assert.ok(Array.isArray(entry.version.tag_ids) && entry.version.owner === 'ShopOwner');

  // Restoring is a normal edit: the current page as base, that version proposed.
  const base = await snapshot(as, P);
  const r = await as('ShopOwner').post(`/api/plots/${P}/revisions`, { action: 'edit', base, proposed: entry.version, summary: 'Restored the version from today' });
  assert.ok(r.status === 201 && r.body.status === 'approved', show(r));
  assert.equal((await as(null).get(`/api/plots/${P}`)).body.shop.palette, 'Version one');

  // Moves and closures carry none, nor do edits to an earlier shop.
  const A = (await as(null).get('/api/plots')).body.find((p) => !p.shop).id;
  await as('ModTester').post(`/api/plots/${A}/revisions`, { action: 'open', proposed: { owner: 'Someone', tag_ids: [] } });
  await edit(as, 'ModTester', A, { palette: 'On the old shop' });
  await as('ModTester').post(`/api/plots/${A}/revisions`, { action: 'open', proposed: { owner: 'Someone else', tag_ids: [] } });
  const onA = (await history(A)).changes;
  assert.ok(onA.every((c) => !('version' in c)), 'nothing to restore across shops');
});

test("the card's last edit: the old Update lines, then saved revisions", async () => {
  const plot = 'corridors-1';
  const lastEdit = async () => (await as(null).get(`/api/plots/${plot}`)).body.shop.last_edit_at;
  assert.equal(await lastEdit(), null, 'imported and never edited: none (not the import time)');
  const db = writeDb(server);
  db.prepare(`INSERT INTO comments (shop_id, author, body, is_system, status, created_at)
    SELECT id, 'carlo_m', 'Update: restocked', 1, 'approved', '2026-10-05 12:00:00' FROM shops WHERE plot_id = ? AND closed_at IS NULL`)
    .run(plot);
  db.close();
  assert.equal(await lastEdit(), '2026-10-05 12:00:00', 'an Update line from before revisions');
  const r = await edit(as, 'ModTester', plot, { palette: 'Slime green' });
  assert.equal(r.status, 201, show(r));
  assert.ok(await lastEdit() > '2026-10-05 12:00:00', 'a saved edit is newer');
});
