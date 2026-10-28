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
