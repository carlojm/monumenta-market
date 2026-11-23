// The Mod log (3.13): every revision action logged with specifics, who can
// read it, and its filters and search.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer } from './helpers/server.js';
import { apiFor, edit } from './helpers/api.js';

let server, as, name2, name7;
before(async () => {
  server = await startServer();
  as = apiFor(server);
  const plots = (await as(null).get('/api/plots')).body;
  const named = (id) => { const s = plots.find((p) => p.id === id).shop; return s.shop_name || s.guild_name || s.owner; };
  [name2, name7] = [named('corridors-2'), named('corridors-7')];
});
after(() => server.stop());

const log = async (query = '') => (await as('ModTester').get(`/api/admin/modlog${query}`)).body;
const entry = async (action, revisionId) => (await log()).entries.find((e) => e.action === action && e.revision_id === revisionId);
const post = async (name, url, data) => (await as(name).post(url, data)).body;

test('who can read it', async () => {
  assert.equal((await as(null).get('/api/admin/modlog')).status, 401);
  assert.equal((await as('Player2').get('/api/admin/modlog')).status, 403);
  assert.equal((await as('ModTester').get('/api/admin/modlog')).status, 200, 'moderators, not only admins');
});

test('a suggestion, its replacement, and withdrawing it', async () => {
  let r = (await edit(as, 'Tester', 'corridors-2', { palette: 'P1' }, { summary: 'saw it today' })).body;
  let e = await entry('revision.suggest', r.id);
  assert.ok(e?.actor === 'Tester' && e.target === 'plot:corridors-2', JSON.stringify(e));
  assert.equal(e.details, `Suggested an edit to ${name2} (Palette)`);
  assert.ok(e.data.changes[0].field === 'palette' && e.data.changes[0].to === 'P1' && e.data.summary === 'saw it today' && e.data.action === 'edit');
  assert.ok(!('tags' in e.data) && !('resolved' in e.data) && !('replaced' in e.data), 'no empty fields stored');

  const base = (await as(null).get('/api/plots/corridors-2')).body.shop;
  const ids = base.tags.map((t) => t.id);
  const extra = (await as(null).get('/api/tags')).body.tags.find((t) => !ids.includes(t.id));
  r = (await edit(as, 'Tester', 'corridors-2', { description: 'D', tag_ids: [...ids, extra.id] })).body;
  e = await entry('revision.suggest', r.id);
  assert.ok(e.data.replaced === 1 && e.data.tags.added[0] === extra.name && e.details.endsWith('(About and tags)'), e.details);
  await as('Tester').post(`/api/revisions/${r.id}/withdraw`);
  e = await entry('revision.withdraw', r.id);
  assert.equal(e?.details, `Withdrew their suggestion: an edit to ${name2} (About and tags)`);
});

test('the owner rejects with a reason', async () => {
  const r = (await edit(as, 'Tester', 'corridors-2', { palette: 'Bad' }, { summary: 'trust me' })).body;
  await as('ShopOwner').post(`/api/revisions/${r.id}/reject`, { note: 'Not what is in game' });
  const e = await entry('revision.reject', r.id);
  assert.equal(e?.actor, 'ShopOwner', 'logged for owners, not only staff');
  assert.equal(e.details, `Rejected Tester's suggestion: an edit to ${name2} (Palette). Reason: "Not what is in game"`);
  assert.ok(e.data.author === 'Tester' && e.data.summary === 'trust me' && e.data.note === 'Not what is in game' && e.data.changes[0].to === 'Bad');
});

test('approving with a clash and a fix, and picking a version', async () => {
  let r = (await edit(as, 'Tester', 'corridors-2', { description: 'Sugg', palette: 'Pallete' })).body;
  const force = (await edit(as, 'ModTester', 'corridors-2', { description: 'Mod' })).body;
  let e = await entry('revision.publish', force.id);
  assert.ok(e?.details === `Force edited: an edit to ${name2} (About)` && e.data.changes[0].to === 'Mod', e?.details);
  await as('ShopOwner').post(`/api/revisions/${r.id}/approve`, { values: { description: 'Mod and more', palette: 'Palette' }, note: 'fixed spelling' });
  e = await entry('revision.approve', r.id);
  assert.equal(e?.details, `Approved Tester's suggestion: an edit to ${name2} (About and Palette), with changes. Note: "fixed spelling"`);
  assert.deepEqual(e.data.resolved, [{ field: 'description', kept: 'edited' }]);
  assert.deepEqual(e.data.edited, [{ field: 'palette', suggested: 'Pallete', saved: 'Palette' }]);
  const about = e.data.changes.find((c) => c.field === 'description');
  assert.ok(about.from === 'Mod' && about.to === 'Mod and more', 'changes are what was saved');

  r = (await edit(as, 'Tester', 'corridors-2', { description: 'S3' })).body;
  await edit(as, 'ModTester', 'corridors-2', { description: 'M3' });
  await as('ShopOwner').post(`/api/revisions/${r.id}/approve`, { values: { description: 'M3' } });
  e = await entry('revision.approve', r.id);
  assert.ok(e.data.resolved[0].kept === 'current' && !e.details.includes('with changes') && !e.data.edited, JSON.stringify(e.data));
});

test('a Force edit after a clash, then undo', async () => {
  const own = (await edit(as, 'ShopOwner', 'corridors-2', { palette: 'Own' },
    { resolved: [{ field: 'palette', kept: 'mine' }, { field: 'password', kept: 'mine' }, { field: 'stock', kept: 'nope' }, 'junk'] })).body;
  let e = await entry('revision.publish', own.id);
  assert.deepEqual(e?.data.resolved, [{ field: 'palette', kept: 'mine' }], 'junk dropped');
  const undo = await post('ShopOwner', `/api/revisions/${own.id}/undo`);
  e = await entry('revision.undo', undo.id);
  assert.ok(e?.details === `Undid their Force edit #${own.id}: an edit to ${name2} (Palette)` && e.data.undid === own.id, e?.details);
});

test('a new shop and an empty plot', async () => {
  const r = await post('Tester', '/api/plots/corridors-7/revisions', { action: 'open', proposed: { owner: 'Newbie', description: 'Hi' }, summary: 'moved in' });
  let e = await entry('revision.suggest', r.id);
  assert.equal(e?.details, `Suggested a new shop by Newbie, replacing ${name7}`);
  assert.ok(e.data.owner === 'Newbie' && e.data.changes.some((c) => c.field === 'description' && c.to === 'Hi'));
  await as('ModTester').post(`/api/revisions/${r.id}/approve`, { values: { owner: 'Newbee' } });
  e = await entry('revision.approve', r.id);
  assert.ok(e.details.includes('a new shop by Newbee') && e.details.includes('with changes') && e.data.edited?.[0]?.field === 'owner', e.details);
  const v = await post('ModTester', '/api/plots/corridors-7/revisions', { action: 'vacate', summary: 'gone' });
  e = await entry('revision.publish', v.id);
  assert.equal(e?.details, 'Force edited: closing Newbee (the plot is now empty)');
  const u = await post('ModTester', `/api/revisions/${v.id}/undo`);
  e = await entry('revision.undo', u.id);
  assert.equal(e?.details, `Undid their Force edit #${v.id}, bringing back Newbee's shop`);
});

test('other entries have no data, and the filters and search work', async () => {
  await as('Tester').post('/api/plots/corridors-3/comments', { body: 'Nice shop' });
  const all = await log();
  const comment = all.entries.find((e) => e.action === 'comment.create');
  assert.ok(comment && comment.data === null, JSON.stringify(comment));
  const kinds = async (kind) => new Set((await log(`?kind=${kind}`)).entries.map((e) => e.action.split('.')[0]));
  assert.deepEqual(await kinds('comments'), new Set(['comment']));
  assert.deepEqual(await kinds('edits'), new Set(['revision']));
  const found = (await log('?q=Newbee')).entries;
  assert.ok(found.length > 0 && found.every((e) => JSON.stringify(e).includes('Newbee')), 'search looks in the text and the data');
  assert.equal((await log('?q=nothing-like-this')).entries.length, 0);
});
