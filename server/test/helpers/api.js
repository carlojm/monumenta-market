// server/test/helpers/api.js
//
// Calling a test server as different accounts. Each account logs in on first
// use and keeps its own cookie.
//
//   const as = apiFor(server);
//   const r = await as('Tester').post('/api/plots/corridors-2/revisions', body);
//   r.status, r.body
//   await as(null).get('/api/plots')        // logged out
//
// Tests never import server code (lib/, db/): that would open the database
// DB_PATH names, and in the test process that's the real market.db. They read
// the test copy with readDb() instead.

import Database from 'better-sqlite3';
import { PASSWORD } from './fixtures.js';

// The shop fields a revision snapshot holds. Must match SHOP_FIELDS in
// lib/shops.js (setup.test.js checks).
export const SHOP_FIELDS = ['owner', 'maintainers', 'shop_name', 'guild_name', 'description', 'stock', 'palette',
  'guild_color', 'primary_color', 'secondary_color'];

export function apiFor(server) {
  const cookies = new Map();

  async function send(name, method, url, data, headers = {}) {
    if (name && !cookies.has(name)) {
      cookies.set(name, '');
      const res = await send(name, 'POST', '/api/auth/login', { name, password: PASSWORD });
      if (res.status !== 200) throw new Error(`Couldn't log in as ${name}: ${res.status}`);
    }
    const res = await fetch(`${server.url}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookies.get(name) ? { cookie: cookies.get(name) } : {}), ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const cookie = res.headers.get('set-cookie');
    if (cookie && name) cookies.set(name, cookie.split(';')[0]);
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  return (name = null) => ({
    get: (url) => send(name, 'GET', url),
    post: (url, data, headers) => send(name, 'POST', url, data, headers),
    put: (url, data, headers) => send(name, 'PUT', url, data, headers),
    delete: (url, data) => send(name, 'DELETE', url, data),
  });
}

// "status body" for an assertion message.
export const show = (r) => `${r.status} ${JSON.stringify(r.body)?.slice(0, 300)}`;

// A plot's current shop as a revision snapshot (null when empty).
export async function snapshot(as, plot) {
  const { shop } = (await as(null).get(`/api/plots/${plot}`)).body;
  if (!shop) return null;
  return { ...Object.fromEntries(SHOP_FIELDS.map((f) => [f, shop[f] ?? null])), tag_ids: shop.tags.map((t) => t.id) };
}

// An edit to a plot's shop, from the page as it is now.
export async function edit(as, name, plot, changes, extra = {}) {
  const base = await snapshot(as, plot);
  return as(name).post(`/api/plots/${plot}/revisions`, { action: 'edit', base, proposed: { ...base, ...changes }, ...extra });
}

// Read-only access to the server's copy of the database, for checks.
export const readDb = (server) => new Database(server.dbPath, { readonly: true });
