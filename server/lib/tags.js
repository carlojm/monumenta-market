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
