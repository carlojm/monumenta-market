// server/lib/shops.js
//
// The basics of a plot's shop, shared by the admin editor (index.js) and page
// revisions (lib/revisions.js): its fields, finding it, and opening/closing.

import db from '../db/init.js';
import { addLogEntry } from './shopLog.js';

// The editable fields of a shop, in display order.
export const SHOP_FIELDS = ['owner', 'shop_name', 'guild_name', 'description', 'stock', 'palette',
  'guild_color', 'primary_color', 'secondary_color'];

export const getPlot = db.prepare('SELECT * FROM plots WHERE id = ?');
export const getCurrentShop = db.prepare('SELECT * FROM shops WHERE plot_id = ? AND closed_at IS NULL');
export const getShop = db.prepare('SELECT * FROM shops WHERE id = ?');

const insertShop = db.prepare(`
  INSERT INTO shops (plot_id, owner, shop_name, guild_name, description, stock, palette,
    guild_color, primary_color, secondary_color, opened_at)
  VALUES (@plot_id, @owner, @shop_name, @guild_name, @description, @stock, @palette,
    @guild_color, @primary_color, @secondary_color, CURRENT_TIMESTAMP)
`);
export const closeShop = db.prepare('UPDATE shops SET closed_at = CURRENT_TIMESTAMP WHERE id = ?');
// Undo (3.3e) brings a just-closed shop back, comments and all.
export const reopenShop = db.prepare('UPDATE shops SET closed_at = NULL WHERE id = ?');

export function openShop(plotId, fields, actor) {
  const row = Object.fromEntries(SHOP_FIELDS.map((f) => [f, fields[f] ?? null]));
  const { lastInsertRowid } = insertShop.run({ ...row, plot_id: plotId });
  addLogEntry(lastInsertRowid, actor, `Shop opened by ${fields.owner}`);
  return lastInsertRowid;
}
