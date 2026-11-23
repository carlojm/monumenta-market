// Shared by the browser tests.
//
//   const server = serverForFile();            // in a test file: its own server
//   const page = await pageAs(browser, server, 'Tester', PHONE);
//   await page.goto('/plot/corridors-2');      // paths are on that server
//   server.as('ShopOwner').post(...)           // set things up through the API
//
// The API helpers come from server/test/helpers (apiFor, edit, snapshot, ...).

import { expect, test } from '@playwright/test';
import { startServer } from '../../server/test/helpers/server.js';
import { apiFor } from '../../server/test/helpers/api.js';
import { PASSWORD } from '../../server/test/helpers/fixtures.js';
import { CLIENT_DIST } from './paths.js';

export { edit, readDb, snapshot } from '../../server/test/helpers/api.js';

export const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
export const DESKTOP = { viewport: { width: 1280, height: 900 } };

// One server and database for the whole file, serving the site and the API.
// The tests in the file run in order and share it.
export function serverForFile() {
  const server = {};
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    const started = await startServer({ env: { CLIENT_DIST } });
    Object.assign(server, started, { as: apiFor(started) });
  });
  test.afterAll(() => server.stop?.());
  return server;
}

// A page logged in as `name` (or logged out when null). Console errors and
// warnings are collected in `page.problems`; expectNoProblems checks them.
export async function pageAs(browser, server, name, options = PHONE) {
  const context = await browser.newContext({ ...options, baseURL: server.url });
  if (name) {
    const res = await context.request.post('/api/auth/login', { data: { name, password: PASSWORD } });
    expect(res.ok(), `log in as ${name}`).toBe(true);
  }
  const page = await context.newPage();
  page.problems = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.problems.push(m.text()); });
  page.on('pageerror', (e) => page.problems.push(e.message));
  return page;
}

export const expectNoProblems = (page) => expect(page.problems, 'console errors or warnings').toEqual([]);

// Text with its spaces tidied, for comparing what's on screen.
export const text = async (locator) => (await locator.textContent()).replace(/\s+/g, ' ').trim();
