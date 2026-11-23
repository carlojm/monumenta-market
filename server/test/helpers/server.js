// server/test/helpers/server.js
//
// Starts the API for one test file: a fresh copy of the seed database (see
// test/seed.js), a free port, and TEST_MODE (lib/env.js). Each test file gets
// its own, so files can run at the same time without touching each other.
//
//   const server = await startServer();
//   ... fetch(`${server.url}/api/plots`) ...
//   await server.stop();

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS, SEED_PATH } from './fixtures.js';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ADMIN_TOKEN = 'test-admin-token';

// Asks the system for a port nothing is using.
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer().listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    }).on('error', reject);
  });
}

// `env` adds settings, e.g. { CLIENT_DIST } so it serves the site too (the
// browser tests in client/e2e).
export async function startServer({ env = {} } = {}) {
  if (!fs.existsSync(SEED_PATH)) throw new Error('No test database yet. Run `node test/seed.js` (npm test does this).');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'market-test-'));
  const dbPath = path.join(dir, 'test.db');
  fs.copyFileSync(SEED_PATH, dbPath);
  const port = await freePort();

  const child = spawn(process.execPath, ['index.js'], {
    cwd: SERVER,
    // Only what the server needs: nothing from your shell or .env leaks in.
    env: {
      PATH: process.env.PATH, TEST_MODE: '1', DB_PATH: dbPath, PORT: String(port), ADMIN_TOKEN,
      ADMIN_UUIDS: ACCOUNTS.filter((a) => a.role === 'admin').map((a) => a.uuid).join(','),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  // Ready once it says so; a crash or 10 seconds of silence is a failure.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server didn't start:\n${output}`)), 10_000);
    child.stdout.on('data', () => {
      if (output.includes(`Server running on port ${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}):\n${output}`));
    });
  });

  return {
    url: `http://localhost:${port}`,
    dbPath,
    output: () => output,
    stop: () => new Promise((resolve) => {
      child.removeAllListeners('exit');
      child.once('exit', () => {
        fs.rmSync(dir, { recursive: true, force: true });
        resolve();
      });
      child.kill();
    }),
  };
}
