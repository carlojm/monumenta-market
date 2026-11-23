// The test setup itself: a fresh seeded database, test mode, and the safety
// check that keeps test mode off the live site.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { startServer } from './helpers/server.js';
import { ACCOUNTS, PASSWORD } from './helpers/fixtures.js';

let server;
before(async () => { server = await startServer(); });
after(() => server.stop());

const get = (url) => fetch(`${server.url}${url}`).then((res) => res.json());
const login = (name, password = PASSWORD) => fetch(`${server.url}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password }),
});

test('the seed has the whole plot map, with ShopOwner on corridors-2', async () => {
  const plots = await get('/api/plots');
  assert.equal(plots.length, 168);
  assert.equal(plots.find((p) => p.id === 'corridors-2').shop.owner, 'ShopOwner');
  assert.equal(plots.find((p) => p.id === 'corridors-4').shop, null);
});

test('every test account can log in', async () => {
  for (const { name, role } of ACCOUNTS) {
    const res = await login(name);
    assert.equal(res.status, 200, name);
    assert.equal((await res.json()).account.role, role);
  }
});

test('rate limits are off: 15 wrong passwords in a row never get a 429', async () => {
  for (let i = 0; i < 15; i++) assert.equal((await login('Tester', 'wrong-password')).status, 401);
});

test('each server has its own copy of the database', async () => {
  const other = await startServer();
  try {
    assert.notEqual(other.dbPath, server.dbPath);
    assert.notEqual(other.url, server.url);
  } finally {
    await other.stop();
  }
});

test('test mode refuses to start on the live site', () => {
  for (const live of [{ FLY_APP_NAME: 'lofy' }, { NODE_ENV: 'production' }]) {
    const run = spawnSync(process.execPath, ['index.js'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: { PATH: process.env.PATH, TEST_MODE: '1', DB_PATH: ':memory:', ...live },
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.notEqual(run.status, 0, JSON.stringify(live));
    assert.match(run.stderr, /TEST_MODE is only for local tests/);
  }
});
