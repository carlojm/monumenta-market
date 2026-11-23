// server/lib/env.js
//
// Settings, loaded before anything else (index.js imports this first).
//
// TEST_MODE=1 is for the automated tests (server/test/): the server runs on a
// throwaway copy of the test database, skips .env (so tests never see real
// keys or touch real storage), and turns rate limits off (so tests can make
// many edits quickly). It refuses to start on the live site.

import dotenv from 'dotenv';

export const TEST_MODE = process.env.TEST_MODE === '1';

if (TEST_MODE && (process.env.FLY_APP_NAME || process.env.NODE_ENV === 'production')) {
  throw new Error('TEST_MODE is only for local tests. It is never allowed on the live site.');
}

if (!TEST_MODE) dotenv.config();
