// Page revisions (3.2): who can submit and what goes live, the per-field
// merge, who can review, new shop / empty plot, withdrawing, and the cap.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer } from './helpers/server.js';
import { apiFor, edit, show, snapshot } from './helpers/api.js';


const OWNER = 'ShopOwner';
const OWNER_PLOT = 'corridors-2'; // ShopOwner's
const PLOT2 = 'corridors-1'; // skelajon's (no account)
const PLOT3 = 'corridors-3'; // SunDraKi's (no account)
const shopOf = async (plot) => (await as(null).get(`/api/plots/${plot}`)).body.shop;
const submit = (name, plot, body) => as(name).post(`/api/plots/${plot}/revisions`, body);
let T1, T2;
// Shared between the tests below, which run in order.
let aliceEdit, ownerQueued, ownerVacate, bobOpen;

let server, as;
before(async () => {
  server = await startServer();
  as = apiFor(server);
  [T1, T2] = (await as(null).get('/api/tags')).body.tags.map((t) => t.id);
});
after(() => server.stop());

test('who can submit, and what goes live', async () => {
  let r = await submit(null, PLOT2, { action: 'edit', base: {}, proposed: {} });
  assert.equal(r.status, 401, 'logged out');
  const base2 = await snapshot(as, PLOT2);
  r = await submit('Tester', PLOT2, { action: 'edit', base: base2, proposed: { ...base2 } });
  assert.ok(r.status === 400 && /haven't changed/.test(r.body.error), `nothing changed: ${show(r)}`);
  r = await submit('Tester', PLOT2, { action: 'edit', base: base2, proposed: { description: 'x'.repeat(4001) } });
  assert.ok(r.status === 400 && /4000/.test(r.body.error), `over 4000: ${show(r)}`);
  r = await submit('Tester', PLOT2, { action: 'edit', base: base2, proposed: { stock: 42 } });
  assert.equal(r.status, 400, `not text: ${show(r)}`);
  r = await submit('Tester', PLOT2, { action: 'edit', base: base2, proposed: { owner: 'Tester' } });
  assert.ok(r.status === 400 && /new shop/.test(r.body.error), `owner change through edit: ${show(r)}`);

  r = await submit('Tester', PLOT2, { action: 'edit', base: base2, proposed: { description: 'Alice v1' }, summary: 'typo' });
  assert.ok(r.status === 201 && r.body.status === 'pending', `a player's edit waits: ${show(r)}`);
  r = await submit('Tester', PLOT2, { action: 'edit', base: base2, proposed: { description: 'Alice v2' } });
  assert.ok(r.status === 201 && r.body.replaced === 1, `a second edit replaces the first: ${show(r)}`);
  aliceEdit = r.body.id;
  assert.equal((await shopOf(PLOT2)).description, base2.description, 'the page is unchanged while pending');

  r = await edit(as, OWNER, OWNER_PLOT, { stock: 'Owner stock' });
  assert.ok(r.status === 201 && r.body.status === 'approved', `the owner's edit goes live: ${show(r)}`);
  assert.equal((await shopOf(OWNER_PLOT)).stock, 'Owner stock');
  r = await edit(as, OWNER, PLOT3, { stock: 'not mine' });
  assert.equal(r.body.status, 'pending', "someone else's shop: a suggestion");
  r = await submit(OWNER, OWNER_PLOT, { action: 'vacate' });
  assert.equal(r.body.status, 'pending', 'closing their own shop needs a mod');
  r = await edit(as, OWNER, OWNER_PLOT, { palette: 'asked for review' }, { request_review: true });
  assert.equal(r.body.status, 'pending', 'the owner can still ask for review');
  assert.equal(r.body.replaced, 1, "...replacing the owner's pending closure");
  ownerQueued = r.body.id;
  ownerVacate = (await submit('Tester', OWNER_PLOT, { action: 'vacate' })).body.id;
});

test('the merge', async () => {
  // The owner's Force edit clashes: a mod changed the same field meanwhile.
  const before = await snapshot(as, OWNER_PLOT);
  await submit('ModTester', OWNER_PLOT, { action: 'edit', base: before, proposed: { ...before, description: 'Mod wrote this' } });
  let r = await submit(OWNER, OWNER_PLOT, { action: 'edit', base: before, proposed: { ...before, description: 'Owner wrote this', shop_name: 'Owner Shop' } });
  assert.ok(r.status === 409 && r.body.conflicts[0].field === 'description' && r.body.conflicts[0].theirs === 'Mod wrote this'
    && r.body.current?.description === 'Mod wrote this', `409 with both values and the live page: ${show(r)}`);
  assert.equal((await shopOf(OWNER_PLOT)).shop_name, before.shop_name, 'nothing half-written');
  r = await submit(OWNER, OWNER_PLOT, { action: 'edit', base: before, proposed: { ...before, shop_name: 'Owner Shop' } });
  assert.ok(r.status === 201 && (await shopOf(OWNER_PLOT)).description === 'Mod wrote this', `a different field merges cleanly: ${show(r)}`);

  // Player2 changes About and tags; then a mod changes Keywords and tags; approving merges both.
  const b3 = await snapshot(as, PLOT3);
  const removed = b3.tag_ids[0];
  r = await submit('Player2', PLOT3, { action: 'edit', base: b3, proposed: { ...b3, description: 'Bob desc', tag_ids: [...b3.tag_ids.slice(1), T1] } });
  const bobEdit = r.body.id;
  const mid = await snapshot(as, PLOT3);
  await submit('ModTester', PLOT3, { action: 'edit', base: mid, proposed: { ...mid, stock: 'Mod stock', tag_ids: [...mid.tag_ids, T2] } });
  const q = (await as('ModTester2').get('/api/revisions/pending')).body.find((x) => x.id === bobEdit);
  assert.ok(q && q.conflicts.length === 0 && q.changes.some((c) => c.field === 'description'), 'the queue shows a clean preview');
  r = await as('ModTester2').post(`/api/revisions/${bobEdit}/approve`, {});
  const s3 = await shopOf(PLOT3);
  assert.ok(r.status === 200 && s3.description === 'Bob desc', `the suggested About applied: ${show(r)}`);
  assert.equal(s3.stock, 'Mod stock', "the mod's Keywords kept");
  const ids = s3.tags.map((t) => t.id);
  assert.ok(ids.includes(T1) && ids.includes(T2) && (removed === undefined || !ids.includes(removed)), `tags merged as a set: ${ids}`);

  // A real clash when approving.
  const c2 = await snapshot(as, PLOT2);
  await submit('ModTester', PLOT2, { action: 'edit', base: c2, proposed: { ...c2, description: 'Mod changed it' } });
  r = await as('ModTester2').post(`/api/revisions/${aliceEdit}/approve`, {});
  assert.ok(r.status === 409 && r.body.conflicts[0].field === 'description', `an unresolved clash: ${show(r)}`);
  r = await as('ModTester2').post(`/api/revisions/${aliceEdit}/approve`, { values: { description: 'Alice v2, tidied' }, note: 'merged both' });
  assert.ok(r.status === 200 && (await shopOf(PLOT2)).description === 'Alice v2, tidied', `resolved by the reviewer: ${show(r)}`);
});

test('who can review', async () => {
  const c2 = await snapshot(as, PLOT2);
  let r = await submit('Tester', PLOT2, { action: 'edit', base: c2, proposed: { ...c2, palette: 'teal' } });
  r = await as('Player2').post(`/api/revisions/${r.body.id}/approve`, {});
  assert.equal(r.status, 403, 'a player approving');
  r = await submit('ModTester', PLOT2, { action: 'edit', base: c2, proposed: { ...c2, guild_name: 'Mod suggestion' }, request_review: true });
  r = await as('ModTester').post(`/api/revisions/${r.body.id}/approve`, {});
  assert.equal(r.status, 200, 'a mod can approve their own queued edit');

  const bobOnOwner = (await edit(as, 'Player2', OWNER_PLOT, { guild_name: 'Bob guild' })).body.id;
  r = await as(OWNER).get('/api/revisions/pending');
  assert.ok(r.body.length > 0 && r.body.every((x) => x.plot_id === OWNER_PLOT), "the owner's queue: only their shop");
  assert.equal(r.body.find((x) => x.id === ownerVacate)?.can_review, false, "a closure there is a mod's call");
  assert.equal((await as(OWNER).post(`/api/revisions/${bobOnOwner}/approve`, {})).status, 200, 'the owner approves an edit to their shop');
  assert.equal((await as(OWNER).post(`/api/revisions/${ownerQueued}/approve`, {})).status, 200, 'and their own queued edit');
  bobOpen = (await submit('Player2', OWNER_PLOT, { action: 'open', proposed: { owner: 'Player2' } })).body.id;
  assert.equal((await as(OWNER).post(`/api/revisions/${bobOpen}/approve`, {})).status, 403, 'a new owner is for mods');
  r = await as('Tester').get('/api/revisions/pending');
  assert.ok(r.status === 200 && r.body.length === 0, `a player's queue is empty: ${show(r)}`);
});

test('new shop, empty plot, stale', async () => {
  let r = await submit('Tester', OWNER_PLOT, { action: 'open', proposed: { owner: OWNER.toUpperCase() } });
  assert.equal(r.status, 400, '"new shop" with the same owner');
  const oldShop = (await shopOf(OWNER_PLOT)).id;
  r = await as('ModTester').post(`/api/revisions/${bobOpen}/approve`, { values: { shop_name: "Bob's Bazaar" } });
  const opened = await shopOf(OWNER_PLOT);
  assert.ok(r.status === 200 && opened.owner === 'Player2' && opened.id !== oldShop && opened.shop_name === "Bob's Bazaar", show(r));
  r = await as('ModTester2').post(`/api/revisions/${ownerVacate}/approve`, {});
  assert.ok(r.status === 409 && r.body.stale, `a closure for the old shop is stale: ${show(r)}`);
  r = await as('ModTester2').post(`/api/revisions/${ownerVacate}/reject`, { note: 'shop changed hands' });
  assert.equal(r.status, 200, '...but can be rejected');
  r = await submit('Tester', PLOT3, { action: 'vacate' });
  r = await as('ModTester').post(`/api/revisions/${r.body.id}/approve`, {});
  assert.ok(r.status === 200 && (await shopOf(PLOT3)) === null, `a mod approves "the plot is now empty": ${show(r)}`);
  assert.equal((await submit('Tester', PLOT3, { action: 'vacate' })).status, 409, 'closing an empty plot');
  assert.equal((await submit('Tester', PLOT3, { action: 'edit', base: {}, proposed: { stock: 'x' } })).status, 409, 'editing an empty plot');
});

test('withdraw, reviewing twice', async () => {
  const r = await edit(as, 'Player2', PLOT2, { palette: 'bob palette' });
  assert.equal((await as('Tester').post(`/api/revisions/${r.body.id}/withdraw`)).status, 404, "withdrawing someone else's");
  assert.equal((await as('Player2').post(`/api/revisions/${r.body.id}/withdraw`)).status, 200, 'the author withdraws it');
  assert.equal((await as('ModTester').post(`/api/revisions/${r.body.id}/approve`, {})).status, 409, 'approving a withdrawn edit');
  assert.equal((await as('ModTester').post(`/api/revisions/${aliceEdit}/reject`, {})).status, 409, 'rejecting an approved edit');
});

test('at most 10 suggestions waiting per account', async () => {
  const plots = (await as(null).get('/api/plots')).body.filter((p) => p.shop && /^(lime|cyan)-/.test(p.id)).slice(0, 11);
  assert.equal(plots.length, 11);
  const codes = [];
  for (const p of plots) codes.push((await edit(as, 'AdminTester', p.id, { palette: 'cap test' }, { request_review: true })).status);
  assert.deepEqual(codes, [...Array(10).fill(201), 429]);
});
