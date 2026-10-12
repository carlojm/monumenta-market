// server/db/load_plots.js
//
// Rebuilds the database from server/data/plots.json. This DROPS every table
// first, so anything entered through the site (comments, reports, images)
// is lost. Use it for the initial import, not on the live database.
//
// Usage (from server/): npm run db:load

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

const c = load();
console.log(`Loaded ${c.plots} plots, ${c.shops} current shops, ${c.past} past shops, ${c.reports} reports.`);
