// server/lib/tags.js
//
// Shops' tags for the API. Only approved tags are shown. Order: categories
// first, then stock tags by group, each in its tags.json order. A tag's color
// falls back to its group's color.

import db from '../db/init.js';

const TAG_COLUMNS = `
  st.shop_id, t.id, t.kind, t.name, t.aliases, g.name AS group_name,
  COALESCE(t.color, g.color) AS color
`;
const ORDER = `ORDER BY t.kind = 'stock', COALESCE(g.sort_order, 0), t.sort_order`;

const allShopTags = db.prepare(`
  SELECT ${TAG_COLUMNS}
  FROM shop_tags st JOIN tags t ON t.id = st.tag_id LEFT JOIN tag_groups g ON g.id = t.group_id
  WHERE t.status = 'approved'
  ${ORDER}
`);
const oneShopTags = db.prepare(`
  SELECT ${TAG_COLUMNS}
  FROM shop_tags st JOIN tags t ON t.id = st.tag_id LEFT JOIN tag_groups g ON g.id = t.group_id
  WHERE st.shop_id = ? AND t.status = 'approved'
  ${ORDER}
`);

const toTag = (row) => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  aliases: JSON.parse(row.aliases),
  group: row.group_name,
  color: row.color,
});

// Map of shop id -> tags, for listing every plot in one query.
export function tagsByShop() {
  const map = new Map();
  for (const row of allShopTags.all()) {
    if (!map.has(row.shop_id)) map.set(row.shop_id, []);
    map.get(row.shop_id).push(toTag(row));
  }
  return map;
}

export function tagsForShop(shopId) {
  return oneShopTags.all(shopId).map(toTag);
}

// --- All approved tags, for the tag picker (and search filters later). ---

const groupsQuery = db.prepare('SELECT id, name, color FROM tag_groups ORDER BY sort_order');
const approvedTags = db.prepare(`
  SELECT t.id, t.kind, t.name, t.aliases, g.name AS group_name, COALESCE(t.color, g.color) AS color
  FROM tags t LEFT JOIN tag_groups g ON g.id = t.group_id
  WHERE t.status = 'approved'
  ORDER BY t.kind = 'stock', COALESCE(g.sort_order, 0), t.sort_order
`);

export function listTags() {
  return { groups: groupsQuery.all(), tags: approvedTags.all().map(toTag) };
}

// --- Setting a shop's tags. ---

const approvedTagById = db.prepare("SELECT id, name FROM tags WHERE id = ? AND status = 'approved'");
const currentTagIds = db.prepare('SELECT tag_id FROM shop_tags WHERE shop_id = ?');
const addShopTag = db.prepare('INSERT OR IGNORE INTO shop_tags (shop_id, tag_id) VALUES (?, ?)');
const removeShopTag = db.prepare('DELETE FROM shop_tags WHERE shop_id = ? AND tag_id = ?');
const tagName = db.prepare('SELECT name FROM tags WHERE id = ?');

// Checks a list of tag ids from a request. Returns { ids } or { error }.
export function checkTagIds(input) {
  if (!Array.isArray(input)) return { error: 'tag_ids must be a list' };
  const ids = [...new Set(input.map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || !approvedTagById.get(id))) {
    return { error: 'Unknown tag in tag_ids' };
  }
  return { ids };
}

// Makes the shop's tags exactly `ids`. Returns the names added and removed.
export function setShopTags(shopId, ids) {
  const before = new Set(currentTagIds.all(shopId).map((r) => r.tag_id));
  const after = new Set(ids);
  const added = ids.filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !after.has(id));
  for (const id of added) addShopTag.run(shopId, id);
  for (const id of removed) removeShopTag.run(shopId, id);
  const names = (list) => list.map((id) => tagName.get(id)?.name).filter(Boolean);
  return { added: names(added), removed: names(removed) };
}

// --- Checking tags from requests (admin Tags tab and player suggestions). ---

export const KINDS = ['category', 'stock'];
export const isHex = (c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);

const groupById = db.prepare('SELECT id FROM tag_groups WHERE id = ?');
// Another tag of the same kind with this name (name is NOCASE). Pass 0 as the id to exclude none.
export const sameName = db.prepare('SELECT id FROM tags WHERE kind = ? AND name = ? AND id != ?');
// The next position at the end of a kind + group (group_id is NULL for categories).
export const endOfGroup = db.prepare(`
  SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tags WHERE kind = ? AND group_id IS ?
`);

// Checks and tidies a tag from a request. Returns { tag } or { error }.
export function cleanTag(body, kind) {
  const name = String(body.name ?? '').trim();
  if (!name) return { error: 'A tag needs a name.' };
  if (name.length > 60) return { error: 'Tag names can be at most 60 characters.' };
  const aliases = Array.isArray(body.aliases) ? body.aliases : [];
  const cleanAliases = [...new Set(aliases.map((a) => String(a).trim()).filter(Boolean))];
  if (cleanAliases.some((a) => a.length > 60)) return { error: 'Aliases can be at most 60 characters.' };
  const color = body.color ? String(body.color).trim() : null;
  if (color && !isHex(color)) return { error: 'Color must be a hex like #7bb0e0, or empty.' };
  let groupId = null;
  if (kind === 'stock') {
    groupId = Number(body.group_id);
    if (!groupById.get(groupId)) return { error: 'Stock tags need a group.' };
  }
  return { tag: { name, aliases: JSON.stringify(cleanAliases), color, group_id: groupId } };
}
