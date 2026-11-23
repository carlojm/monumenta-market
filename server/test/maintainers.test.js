// Maintainers (3.8): they run the shop with the owner (direct edits,
// reviewing), except that only the owner changes who the maintainers are.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer } from './helpers/server.js';
import { apiFor, edit, readDb, show } from './helpers/api.js';

let server, as;
before(async () => { server = await startServer(); as = apiFor(server); });
after(() => server.stop());

const P = 'corridors-2'; // ShopOwner's
const G = 'eastguild-1'; // FISH, a guild: no account is its owner
const shop = async (plot) => (await as(null).get(`/api/plots/${plot}`)).body.shop;
let listChange;

test('the owner sets maintainers, and the names are checked', async () => {
  let r = await edit(as, 'ShopOwner', P, { maintainers: 'bad-name' });
  assert.deepEqual([r.status, r.body.error], [400, '"bad-name" isn\'t a Minecraft name.']);
  r = await edit(as, 'ShopOwner', P, { maintainers: Array.from({ length: 11 }, (_, i) => `Name${i}`).join(' ') });
  assert.deepEqual([r.status, r.body.error], [400, 'A shop can have at most 10 maintainers.']);
  r = await edit(as, 'ShopOwner', P, { maintainers: ' Tester,  tester\nNobody_1 ' });
  assert.ok(r.status === 201 && r.body.status === 'approved', `the owner publishes it: ${show(r)}`);
  assert.equal((await shop(P)).maintainers, 'Tester, Nobody_1', 'saved tidy, the repeat dropped');
  assert.equal((await as(null).get('/api/plots')).body.find((p) => p.id === P).shop.maintainers, 'Tester, Nobody_1', 'the map list has them');
});

test('a maintainer edits directly, and can undo', async () => {
  let r = await edit(as, 'Tester', P, { palette: 'M' });
  assert.ok(r.status === 201 && r.body.status === 'approved' && (await shop(P)).palette === 'M', show(r));
  const undo = await as('Tester').post(`/api/revisions/${r.body.id}/undo`);
  assert.ok(undo.status === 201 && (await shop(P)).palette !== 'M', show(undo));
  r = await edit(as, 'Tester', P, { palette: 'R' }, { request_review: true });
  assert.equal(r.body.status, 'pending', 'asking for review still makes a suggestion');
  await as('Tester').post(`/api/revisions/${r.body.id}/withdraw`);
  r = await as('Tester').post(`/api/plots/${P}/revisions`, { action: 'vacate' });
  assert.ok(r.body.status === 'pending' && (await shop(P)), "closing the shop is still a mod's call");
  await as('Tester').post(`/api/revisions/${r.body.id}/withdraw`);
});

test("a maintainer can't change who the maintainers are", async () => {
  const r = await edit(as, 'Tester', P, { maintainers: 'Tester, Nobody_1, Friend' });
  assert.ok(r.body.status === 'pending' && (await shop(P)).maintainers === 'Tester, Nobody_1', `it becomes a suggestion: ${show(r)}`);
  listChange = r.body.id;
  assert.equal((await as('Tester').post(`/api/revisions/${listChange}/approve`, {})).status, 403, "which they can't approve");
});

test('the review queue', async () => {
  const sugg = (await edit(as, 'Player2', P, { stock: 'S' })).body.id;
  const queue = (await as('Tester').get('/api/revisions/pending')).body;
  assert.equal(queue.find((e) => e.id === sugg)?.can_review, true, "a maintainer reviews a player's edit");
  assert.equal(queue.find((e) => e.id === listChange)?.can_review, false, '...but not a change to the maintainers');
  const card = (await as('Tester').get(`/api/plots/${P}`)).body.pending_edits;
  assert.equal(card.find((e) => e.id === listChange)?.can_review, false, 'the card agrees');
  assert.ok(!(await as('Player2').get('/api/revisions/pending')).body.some((e) => e.id === sugg), "other players don't see the queue");
  let r = await as('Tester').post(`/api/revisions/${sugg}/approve`, { note: 'thanks' });
  assert.ok(r.status === 200 && (await shop(P)).stock === 'S', show(r));
  r = await as('ShopOwner').post(`/api/revisions/${listChange}/approve`, {});
  assert.ok(r.status === 200 && (await shop(P)).maintainers === 'Tester, Nobody_1, Friend', `the owner can: ${show(r)}`);

  const db = readDb(server);
  const line = db.prepare('SELECT details, data FROM mod_log WHERE revision_id = ? ORDER BY id DESC').get(listChange);
  db.close();
  assert.ok(line.details.includes('(Maintainers)') && JSON.parse(line.data).changes[0].to === 'Tester, Nobody_1, Friend', line.details);
});

test('a guild shop: mods set the maintainers', async () => {
  let r = await edit(as, 'Player2', G, { palette: 'G' });
  assert.equal(r.body.status, 'pending', 'before: only a suggestion');
  r = await edit(as, 'ModTester', G, { maintainers: 'Player2' });
  assert.equal((await shop(G)).maintainers, 'Player2');
  r = await edit(as, 'Player2', G, { palette: 'G2' });
  assert.ok(r.status === 201 && r.body.status === 'approved', `now it publishes: ${show(r)}`);
});

test('removing a maintainer', async () => {
  await edit(as, 'ShopOwner', P, { maintainers: 'Nobody_1' });
  const r = await edit(as, 'Tester', P, { palette: 'X' });
  assert.equal(r.body.status, 'pending', "the removed maintainer's edit is a suggestion again");
});
