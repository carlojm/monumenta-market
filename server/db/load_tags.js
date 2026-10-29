// server/db/load_tags.js
//
// Loads server/data/tags.json into the database. Safe to run on the live site:
// it adds new tags and updates existing ones (matched by kind + name), and
// never deletes anything, so shops keep their tags and tags added from the
// admin page survive. The order in the file becomes the display order.
//
// Once tags are being edited on the site (Admin → Tags), the site is the real
// list: running this again overwrites those edits with the file's values.
//
// Usage (from server/): npm run tags:load
// On Fly:               fly ssh console -C "npm run tags:load"
//
// Colors only:          npm run tags:load -- --colors-only
// Copies just the colors from the file, and only where the file has one, onto
// tags (and groups) that already exist. Nothing else changes, so it's safe
// after tags have been edited on the site. It never clears a color, and tags
// renamed on the site (so not found by name) are listed and skipped.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './init.js';

const FILE = process.env.TAGS_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/tags.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// Check the whole file before changing anything.
const isHex = (c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
const problems = [];
const groupNames = new Set((data.groups ?? []).map((g) => g.name.toLowerCase()));
const checkColor = (where, color) => {
  if (color != null && !isHex(color)) problems.push(`${where}: color "${color}" isn't a hex like #7bb0e0 (or null)`);
};
for (const g of data.groups ?? []) checkColor(`group "${g.name}"`, g.color);
for (const t of data.categories ?? []) checkColor(`category "${t.name}"`, t.color);
for (const t of data.stock ?? []) {
  checkColor(`tag "${t.name}"`, t.color);
  if (!groupNames.has(String(t.group).toLowerCase())) problems.push(`tag "${t.name}": group "${t.group}" isn't in the groups list`);
}
for (const kind of ['categories', 'stock']) {
  const names = (data[kind] ?? []).map((t) => t.name.toLowerCase());
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) problems.push(`${kind}: duplicate names ${[...new Set(dupes)].join(', ')}`);
}
if (problems.length) {
  console.error(`tags.json has problems, nothing was changed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

if (process.argv.includes('--colors-only')) {
  const setTagColor = db.prepare('UPDATE tags SET color = ? WHERE kind = ? AND name = ?');
  const setGroupColor = db.prepare('UPDATE tag_groups SET color = ? WHERE name = ?');
  const tagColor = db.prepare('SELECT color FROM tags WHERE kind = ? AND name = ?');
  const groupColor = db.prepare('SELECT color FROM tag_groups WHERE name = ?');
  const result = { changed: 0, same: 0, missing: [] };
  // `current` is the row in the database (or undefined); `write` saves the color.
  const apply = (label, current, color, write) => {
    if (!current) result.missing.push(label);
    else if (current.color === color) result.same++;
    else {
      write();
      result.changed++;
    }
  };
  db.transaction(() => {
    for (const g of data.groups ?? []) {
      if (g.color == null) continue;
      apply(`group "${g.name}"`, groupColor.get(g.name), g.color, () => setGroupColor.run(g.color, g.name));
    }
    for (const [kind, list] of [['category', data.categories], ['stock', data.stock]]) {
      for (const t of list ?? []) {
        if (t.color == null) continue;
        const name = t.name.trim();
        apply(t.name, tagColor.get(kind, name), t.color, () => setTagColor.run(t.color, kind, name));
      }
    }
  })();
  console.log(`Colors: ${result.changed} changed, ${result.same} already set.`);
  if (result.missing.length) console.log(`Not found by name (skipped): ${result.missing.join(', ')}`);
  process.exit(0);
}

const upsertGroup = db.prepare(`
  INSERT INTO tag_groups (name, color, sort_order) VALUES (@name, @color, @sort_order)
  ON CONFLICT(name) DO UPDATE SET color = excluded.color, sort_order = excluded.sort_order
`);
const groupId = db.prepare('SELECT id FROM tag_groups WHERE name = ?');
const findTag = db.prepare('SELECT id FROM tags WHERE kind = ? AND name = ?');
const insertTag = db.prepare(`
  INSERT INTO tags (kind, name, aliases, group_id, color, sort_order, status)
  VALUES (@kind, @name, @aliases, @group_id, @color, @sort_order, 'approved')
`);
const updateTag = db.prepare(`
  UPDATE tags SET name = @name, aliases = @aliases, group_id = @group_id, color = @color,
    sort_order = @sort_order, status = 'approved'
  WHERE id = @id
`);

const counts = { added: 0, updated: 0 };
db.transaction(() => {
  (data.groups ?? []).forEach((g, i) => upsertGroup.run({ name: g.name, color: g.color ?? null, sort_order: i }));

  const save = (kind, t, i) => {
    const row = {
      kind,
      name: t.name.trim(),
      aliases: JSON.stringify((t.aliases ?? []).map((a) => a.trim()).filter(Boolean)),
      group_id: kind === 'stock' ? groupId.get(t.group).id : null,
      color: t.color ?? null,
      sort_order: i,
    };
    const existing = findTag.get(kind, row.name);
    if (existing) {
      updateTag.run({ ...row, id: existing.id });
      counts.updated++;
    } else {
      insertTag.run(row);
      counts.added++;
    }
  };
  (data.categories ?? []).forEach((t, i) => save('category', t, i));
  (data.stock ?? []).forEach((t, i) => save('stock', t, i));
})();

// Tags in the database that the file doesn't mention (e.g. added on the site).
const inFile = new Set([
  ...(data.categories ?? []).map((t) => `category:${t.name.toLowerCase()}`),
  ...(data.stock ?? []).map((t) => `stock:${t.name.toLowerCase()}`),
]);
const extra = db.prepare('SELECT kind, name FROM tags').all().filter((t) => !inFile.has(`${t.kind}:${t.name.toLowerCase()}`));

console.log(`Tags: ${counts.added} added, ${counts.updated} updated (${data.groups?.length ?? 0} groups).`);
if (extra.length) {
  console.log(`Kept ${extra.length} tag(s) that aren't in tags.json: ${extra.map((t) => t.name).join(', ')}`);
}
