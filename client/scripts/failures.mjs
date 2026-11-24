// Runs Playwright on the given spec files and prints a short summary: how
// many passed, then for each failure its title, file:line and the first lines
// of its error, instead of pages of test output.
//
//   npm run test:e2e:summary -- e2e/a.spec.js e2e/b.spec.js   (no files: all of them)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const out = path.join(os.tmpdir(), `pw-${process.pid}.json`);
spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2), '--reporter=json'], {
  env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: out },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const report = JSON.parse(fs.readFileSync(out, 'utf8'));
fs.rmSync(out);

const failures = [];
let passed = 0;
const walk = (suite) => {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) {
      const last = t.results.at(-1);
      if (t.status === 'expected') passed++;
      else if (t.status !== 'skipped') failures.push({ title: spec.title, file: spec.file, line: spec.line, error: last?.error });
    }
  }
  (suite.suites ?? []).forEach(walk);
};
report.suites.forEach(walk);

const skipped = report.stats?.skipped ?? 0;
console.log(`${passed} passed, ${failures.length} failed${skipped ? `, ${skipped} did not run` : ''}`);
for (const f of failures) {
  const where = f.error?.location ? `${path.basename(f.error.location.file)}:${f.error.location.line}` : `${f.file}:${f.line}`;
  // Strip terminal colors; keep the message's first lines.
  const message = (f.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').filter(Boolean).slice(0, 6).join('\n    ');
  console.log(`\n✘ ${f.title}  (${where})\n    ${message}`);
}
