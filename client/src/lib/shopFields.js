// A shop's fields, for the edit form (ShopEditForm) and pending edits on the card.

// Every field of a shop, as the server's revisions expect (server/lib/shops.js).
export const SHOP_FIELDS = ['owner', 'maintainers', 'shop_name', 'guild_name', 'description', 'stock', 'palette',
  'guild_color', 'primary_color', 'secondary_color'];

// The fields players edit, in card order. Lengths match the server's limits.
// The colors are left to the admin editor: the site doesn't show them (4.10).
export const FIELDS = [
  { key: 'maintainers', label: 'Maintainers', max: 400,
    hint: 'Minecraft names, separated by commas. They can edit this page without review.' },
  { key: 'shop_name', label: 'Shop name', max: 80, hint: "Leave blank to use the owner's name." },
  { key: 'guild_name', label: 'Guild name', max: 80, guildOnly: true },
  { key: 'description', label: 'About', max: 4000, multiline: true },
  { key: 'stock', label: 'Keywords', max: 4000, multiline: true, hint: 'What the shop sells. Search looks here.' },
  { key: 'palette', label: 'Palette', max: 200 },
];

// Typed only for a new shop; an edit can't change the owner.
export const OWNER = { key: 'owner', label: 'Owner', max: 32, hint: 'Player name, or the guild tag without brackets.' };

const COLOR_LABELS = { guild_color: 'Guild color', primary_color: 'Primary color', secondary_color: 'Secondary color' };

export const labelOf = (key) => [OWNER, ...FIELDS].find((f) => f.key === key)?.label ?? COLOR_LABELS[key] ?? key;

// A tag's name from its id: the tag list (GET /api/tags) first, then the
// shop's own tags (a shop can keep a tag that's no longer in the list).
export const tagNamer = (catalog, shopTags = []) => (id) =>
  catalog?.tags.find((t) => t.id === id)?.name ?? shopTags.find((t) => t.id === id)?.name ?? `#${id}`;

// Maintainers (3.8) are kept as "Alice, Bob".
export const maintainersOf = (shop) => (shop?.maintainers ? shop.maintainers.split(', ') : []);

// What a revision changed, for a sentence: "About, Palette and tags". `d` has
// `changes` ([{ field }]) and `tags` ({ added, removed }), as the server sends.
export function changedFields(d) {
  const parts = (d.changes ?? []).map((c) => labelOf(c.field));
  if (d.tags?.added.length || d.tags?.removed.length) parts.push('tags');
  if (parts.length < 2) return parts[0] ?? null;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
