// server/test/helpers/fixtures.js
//
// What the test database holds (test/seed.js builds it), for tests to use.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEED_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.cache/seed.db');

// Every test account has this password.
export const PASSWORD = 'testpassword';
// Admins aren't stored in the database: the server gets their UUIDs in
// ADMIN_UUIDS, like the live site (helpers/server.js).
export const ACCOUNTS = [
  { name: 'Tester', role: 'player' },
  { name: 'Player2', role: 'player' },
  { name: 'ShopOwner', role: 'player' }, // owns corridors-2
  { name: 'ModTester', role: 'moderator' },
  { name: 'ModTester2', role: 'moderator' },
  { name: 'AdminTester', role: 'admin' },
].map((a, i) => ({ ...a, uuid: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}` }));
