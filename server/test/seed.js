// server/test/seed.js
//
// Builds the test database every test starts from (test/.cache/seed.db):
//   - the plot map and shops from data/plots.json, and the tags from
//     data/tags.json, through the same loaders the site was imported with
//   - the test accounts in helpers/fixtures.js, all with one password
//   - corridors-2 belonging to ShopOwner, so owner tests have an account
// Each test copies this file (helpers/server.js), so every run starts from
// the same data and no test can break another.
//
// Usage (from server/): node test/seed.js   (npm test runs it first)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS, PASSWORD, SEED_PATH } from './helpers/fixtures.js';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = SEED_PATH;

fs.mkdirSync(path.dirname(SEED), { recursive: true });
for (const f of [SEED, `${SEED}-wal`, `${SEED}-shm`]) fs.rmSync(f, { force: true });

// The loaders open whatever DB_PATH names, so they only ever touch SEED.
const env = { ...process.env, DB_PATH: SEED };
const run = (script, ...args) => execFileSync(process.execPath, [script, ...args], { cwd: SERVER, env, stdio: 'pipe' });
run('db/load_plots.js', '--wipe-site-data');
run('db/load_tags.js');

process.env.DB_PATH = SEED;
const { default: db } = await import('../db/init.js');
const { hashPassword } = await import('../lib/auth.js');

const hash = await hashPassword(PASSWORD);
const insert = db.prepare('INSERT INTO accounts (uuid, name, password_hash, role) VALUES (?, ?, ?, ?)');
db.transaction(() => {
  for (const a of ACCOUNTS) insert.run(a.uuid, a.name, hash, a.role === 'moderator' ? 'moderator' : 'player');
  db.prepare("UPDATE shops SET owner = 'ShopOwner' WHERE plot_id = 'corridors-2' AND closed_at IS NULL").run();
})();
db.pragma('wal_checkpoint(TRUNCATE)'); // everything in the one file, ready to copy
db.close();
console.log(`Test database ready: ${path.relative(SERVER, SEED)}`);
