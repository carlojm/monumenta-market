// Runs once before the browser tests: builds the test database (see
// server/test/seed.js) and the site, which each test's server then serves
// (helpers.js). Testing the real build, like production.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_DIST } from './paths.js';

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export default function globalSetup() {
  execFileSync(process.execPath, ['test/seed.js'], { cwd: path.join(CLIENT, '../server'), stdio: 'inherit' });
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', CLIENT_DIST, '--emptyOutDir', '--logLevel', 'warn'],
    { cwd: CLIENT, stdio: 'inherit' });
}
