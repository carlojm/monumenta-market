// server/db/load_plots.js
//
// Rebuilds the database from server/data/plots.json. This DROPS the shop
// tables first, so anything entered through the site (comments, reports,
// images, shop tags) is lost. It was for the initial import only: the live
// database is now the real record, and plots.json is retired.
//
// So it refuses to run on a database that has anything the site added (see
// siteData below). On your computer, --wipe-site-data rebuilds anyway (for a
// test database). On Fly it always refuses.
//
// Usage (from server/): npm run db:load
//                       npm run db:load -- --wipe-site-data   (local only)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db, { createSchema, dropSchema } from './init.js';

const AUTHOR = 'carlo_m';
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/plots.json');
const plots = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// plots.json dates are YYYY-MM-DD; store them as midday UTC.
const ts = (date) => (date ? `${date} 12:00:00` : null);

const load = db.transaction(() => {
  dropSchema();
  createSchema();

  // Prepared after the schema exists, since an old database has different columns.
  const insertPlot = db.prepare(
    'INSERT INTO plots (id, zone, x, z, is_guild) VALUES (@id, @zone, @x, @z, @is_guild)'
  );
  const insertShop = db.prepare(`
    INSERT INTO shops (plot_id, owner, shop_name, guild_name, description, stock, palette,
      guild_color, primary_color, secondary_color, opened_at, closed_at, updated_at)
    VALUES (@plot_id, @owner, @shop_name, @guild_name, @description, @stock, @palette,
      @guild_color, @primary_color, @secondary_color, NULL, @closed_at, CURRENT_TIMESTAMP)
  `);
  const insertComment = db.prepare(`
    INSERT INTO comments (shop_id, author, body, is_system, status, created_at)
    VALUES (?, ?, ?, 0, 'approved', ?)
  `);
  const insertReport = db.prepare(
    'INSERT INTO reports (plot_id, shop_id, activity, lock, created_at) VALUES (?, ?, ?, ?, ?)'
  );

  function addShop(plotId, shop, closedAt) {
    const { lastInsertRowid: shopId } = insertShop.run({
      plot_id: plotId,
      owner: shop.owner,
      shop_name: shop.shop_name || null,
      guild_name: shop.guild_name || null,
      description: shop.description || null,
      stock: shop.stock || null,
      palette: shop.palette || null,
      guild_color: shop.guild_color || null,
      primary_color: shop.primary_color || null,
      secondary_color: shop.secondary_color || null,
      closed_at: closedAt,
    });
    for (const c of shop.comments ?? []) insertComment.run(shopId, AUTHOR, c.body, ts(c.date));
    return shopId;
  }

  const counts = { plots: 0, shops: 0, past: 0, reports: 0 };
  for (const p of plots) {
    insertPlot.run({ id: p.id, zone: p.zone, x: p.x, z: p.z, is_guild: p.is_guild ? 1 : 0 });
    counts.plots++;
    // Past shops first so ids roughly follow history.
    for (const old of p.past_shops ?? []) {
      addShop(p.id, old, ts(old.closed));
      counts.past++;
    }
    if (p.shop) {
      const shopId = addShop(p.id, p.shop, null);
      counts.shops++;
      const r = p.shop.report;
      if (r && (r.activity || r.lock)) {
        insertReport.run(p.id, shopId, r.activity, r.lock, ts(r.date));
        counts.reports++;
      }
    }
  }
  return counts;
});

// Things only the site creates. plots.json reports are all stamped 12:00:00,
// so a report at any other time came from a player.
const SITE_DATA = [
  ['accounts', 'SELECT count(*) FROM accounts'],
  ['images', 'SELECT count(*) FROM images'],
  ['shop tags', 'SELECT count(*) FROM shop_tags'],
  ['comment votes', 'SELECT count(*) FROM comment_votes'],
  ['page revisions', 'SELECT count(*) FROM revisions'],
  ['moderator log entries', 'SELECT count(*) FROM mod_log'],
  ['comments by players or the shop log', 'SELECT count(*) FROM comments WHERE account_id IS NOT NULL OR is_system = 1'],
  ['reports from players', "SELECT count(*) FROM reports WHERE created_at NOT LIKE '% 12:00:00'"],
];

function siteData() {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all());
  return SITE_DATA.flatMap(([label, sql]) => {
    const table = sql.match(/FROM (\w+)/)[1];
    if (!tables.has(table)) return []; // a brand-new database
    const n = db.prepare(sql).pluck().get();
    return n ? [`${n} ${label}`] : [];
  });
}

const found = siteData();
if (found.length) {
  const onFly = !!process.env.FLY_APP_NAME;
  const override = process.argv.includes('--wipe-site-data') && !onFly;
  if (!override) {
    console.error(`Refusing to rebuild: this database has data from the site (${found.join(', ')}).`);
    console.error('Rebuilding would delete it. plots.json is retired; edit through the admin pages instead.');
    if (!onFly) console.error('For a local test database only: npm run db:load -- --wipe-site-data');
    process.exit(1);
  }
  console.log(`Wiping site data as asked: ${found.join(', ')}.`);
}

const c = load();
console.log(`Loaded ${c.plots} plots, ${c.shops} current shops, ${c.past} past shops, ${c.reports} reports.`);
