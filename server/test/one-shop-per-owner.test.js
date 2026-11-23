// One shop per owner (3.12): opening a shop for someone who has one
// elsewhere moves them, and undo puts both plots back.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN_TOKEN, startServer } from './helpers/server.js';
import { apiFor, readDb, show } from './helpers/api.js';

let server, as, db, A, B, C, D;
before(async () => {
  server = await startServer();
  as = apiFor(server);
  db = readDb(server);
  [A, B, C, D] = (await as(null).get('/api/plots')).body.filter((p) => !p.shop).map((p) => p.id);
});
after(() => { db.close(); return server.stop(); });

const open = (name, plot, owner) => as(name).post(`/api/plots/${plot}/revisions`, { action: 'open', proposed: { owner, shop_name: `Shop of ${owner}`, tag_ids: [] } });
const current = (plot) => db.prepare('SELECT * FROM shops WHERE plot_id = ? AND closed_at IS NULL').get(plot);
const partOf = (id) => db.prepare('SELECT * FROM revisions WHERE part_of = ?').all(id);
const logOf = (id) => db.prepare('SELECT * FROM mod_log WHERE revision_id = ? ORDER BY id DESC LIMIT 1').get(id);
const MOVER = 'Mover';
let firstShop, move;

test('a first shop: nothing to move', async () => {
  const r = await open('ModTester', A, MOVER);
  assert.ok(r.status === 201 && current(A)?.owner === MOVER, show(r));
  assert.equal(partOf(r.body.id).length, 0);
  assert.ok(!logOf(r.body.id).details.includes('moving'));
  firstShop = current(A).id;
});

test('the same owner (other case) opens elsewhere: a move', async () => {
  move = await open('ModTester', B, MOVER.toLowerCase());
  assert.ok(move.status === 201 && current(B)?.owner === 'mover' && !current(A), show(move));
  const [half] = partOf(move.body.id);
  assert.ok(half && half.plot_id === A && half.action === 'vacate' && half.direct === 1 && half.shop_id === firstShop, JSON.stringify(half));
  assert.equal(half.summary, `${MOVER} moved to ${B}`);
  assert.equal(db.prepare('SELECT count(*) FROM comments WHERE is_system = 1 AND shop_id = ? AND body LIKE ?').pluck()
    .get(firstShop, `%moved to ${B}%`), 1, "the old shop's log says where they went");
  const line = logOf(move.body.id);
  assert.ok(line.details.endsWith(`moving from ${A}`) && JSON.parse(line.data).moved_from === A, line.details);
  const mine = (await as('ModTester').get('/api/revisions/mine')).body.edits;
  assert.equal(mine.find((e) => e.id === move.body.id)?.moved_from, A, 'Your edits says where it moved from');
  assert.ok(!mine.some((e) => e.id === half.id), '...and leaves out the other half');
});

test('undo puts both plots back', async () => {
  const [half] = partOf(move.body.id);
  let r = await as('ModTester').post(`/api/revisions/${half.id}/undo`);
  assert.deepEqual([r.status, r.body.error], [409, `This was part of #${move.body.id}. Undo that instead.`]);
  r = await as('ModTester').post(`/api/revisions/${move.body.id}/undo`);
  assert.ok(r.status === 201 && !current(B) && current(A)?.id === firstShop, show(r));
  const [back] = partOf(r.body.id);
  assert.ok(back?.plot_id === A && back.action === 'open', 'the reopening is recorded on the old plot');
  assert.ok(logOf(r.body.id).details.endsWith(`reopening their shop at ${A}`), logOf(r.body.id).details);
});

test('a suggestion: the reviewer sees the move, approving does it', async () => {
  const r = await open('Tester', B, MOVER);
  assert.equal(r.body.status, 'pending');
  const card = (await as('Tester').get(`/api/plots/${B}`)).body.pending_edits.find((e) => e.id === r.body.id);
  assert.equal(card?.moves_from, A, 'the card');
  const queued = (await as('ModTester').get('/api/revisions/pending')).body.find((e) => e.id === r.body.id);
  assert.equal(queued?.moves_from, A, 'the review queue');
  assert.equal((await as('ModTester').post(`/api/revisions/${r.body.id}/approve`, {})).status, 200);
  assert.ok(current(B)?.owner === MOVER && !current(A) && partOf(r.body.id)[0]?.plot_id === A);
  assert.ok(logOf(r.body.id).details.includes(`moving from ${A}`));
});

test("undo is refused when the old plot changed since", async () => {
  const m2 = await open('ModTester', C, MOVER); // B to C
  await open('ModTester', B, 'Someone'); // B gets a new shop
  const r = await as('ModTester').post(`/api/revisions/${m2.body.id}/undo`);
  assert.ok(r.status === 409 && r.body.error.startsWith(`${B} has changed since`), show(r));
  assert.ok(current(C)?.owner === MOVER && current(B)?.owner === 'Someone', 'nothing changed');
});

test("undo can't give an owner two shops", async () => {
  const v = await as('ModTester').post(`/api/plots/${C}/revisions`, { action: 'vacate' });
  await open('ModTester', D, MOVER); // C is closed, so nothing moves
  const r = await as('ModTester').post(`/api/revisions/${v.body.id}/undo`);
  assert.deepEqual([r.status, r.body.error], [409, `${MOVER} has a shop at ${D} now, so this can no longer be undone.`]);
});

test('the admin editor', async () => {
  let r = await as('ModTester').put(`/api/plots/${B}/shop`, { owner: MOVER, rename: true });
  assert.deepEqual([r.status, r.body.error], [400, `${MOVER} already has a shop at ${D}.`], 'renaming to someone with a shop');
  r = await as(null).put(`/api/plots/${B}/shop`, { owner: MOVER.toUpperCase() }, { Authorization: `Bearer ${ADMIN_TOKEN}` });
  assert.ok(r.status === 201 && current(B)?.owner === 'MOVER' && !current(D), `opening one moves them: ${show(r)}`);
  const id = db.prepare('SELECT id FROM revisions WHERE plot_id = ? ORDER BY id DESC LIMIT 1').pluck().get(B);
  assert.equal(partOf(id)[0]?.plot_id, D);
  assert.ok(db.prepare("SELECT details FROM mod_log WHERE action = 'shop.open' ORDER BY id DESC LIMIT 1").pluck().get().endsWith(`moving them from ${D}`));
});

test('no owner has two current shops', () => {
  assert.deepEqual(db.prepare('SELECT lower(owner) o, count(*) n FROM shops WHERE closed_at IS NULL GROUP BY o HAVING n > 1').all(), []);
});
