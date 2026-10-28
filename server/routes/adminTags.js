// server/routes/adminTags.js
//
// Tag management for moderators and admins, mounted at /api/admin.
//   GET  /tags                       every tag in display order, with how many shops use it
//   POST /tags {kind, name, aliases?, group_id?, color?}   add (goes to the end of its group)
//   PUT  /tags/:id {name, aliases, group_id, color}        edit (a new group puts it at the end)
//   POST /tags/:id/move {direction: up|down}               swap with its neighbour in the group
//   PUT  /tag-groups/:id {color}                           a group's fallback color
//
// Once tags are edited here, the site is the real list: rerunning tags:load
// would overwrite these edits with tags.json.

import express from 'express';
import db from '../db/init.js';
import { requireModerator } from '../middleware/adminAuth.js';
import { logModAction } from '../lib/modlog.js';

// requireModerator goes on each route: other /api/admin routes have their own checks.
const router = express.Router();

const KINDS = ['category', 'stock'];
const isHex = (c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);

const getTag = db.prepare('SELECT * FROM tags WHERE id = ?');
const getGroup = db.prepare('SELECT * FROM tag_groups WHERE id = ?');
const sameName = db.prepare('SELECT id FROM tags WHERE kind = ? AND name = ? AND id != ?'); // name is NOCASE
// The next position at the end of a kind + group (group_id is NULL for categories).
const endOfGroup = db.prepare(`
  SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tags WHERE kind = ? AND group_id IS ?
`);

// Checks and tidies a tag from a request. Returns { tag } or { error }.
function cleanTag(body, kind) {
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
    if (!getGroup.get(groupId)) return { error: 'Stock tags need a group.' };
  }
  return { tag: { name, aliases: JSON.stringify(cleanAliases), color, group_id: groupId } };
}

const listTags = db.prepare(`
  SELECT t.id, t.kind, t.name, t.aliases, t.color, t.group_id, t.sort_order, t.status,
    COALESCE(t.color, g.color) AS effective_color,
    (SELECT COUNT(*) FROM shop_tags st JOIN shops s ON s.id = st.shop_id
     WHERE st.tag_id = t.id AND s.closed_at IS NULL) AS shop_count
  FROM tags t LEFT JOIN tag_groups g ON g.id = t.group_id
  ORDER BY t.kind = 'stock', COALESCE(g.sort_order, 0), t.sort_order
`);
const listGroups = db.prepare('SELECT id, name, color, sort_order FROM tag_groups ORDER BY sort_order');

router.get('/tags', requireModerator, (req, res) => {
  res.json({
    groups: listGroups.all(),
    tags: listTags.all().map((t) => ({ ...t, aliases: JSON.parse(t.aliases) })),
  });
});

router.post('/tags', requireModerator, (req, res) => {
  const kind = req.body.kind;
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be category or stock' });
  const { tag, error } = cleanTag(req.body, kind);
  if (error) return res.status(400).json({ error });
  if (sameName.get(kind, tag.name, 0)) return res.status(400).json({ error: `There's already a tag called "${tag.name}".` });

  const id = db.transaction(() => {
    const { next } = endOfGroup.get(kind, tag.group_id);
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO tags (kind, name, aliases, group_id, color, sort_order, status)
      VALUES (@kind, @name, @aliases, @group_id, @color, @sort_order, 'approved')
    `).run({ ...tag, kind, sort_order: next });
    logModAction(req, 'tag.add', `tag:${lastInsertRowid}`, `Added ${kind === 'category' ? 'category' : 'tag'} "${tag.name}"`);
    return lastInsertRowid;
  })();
  res.status(201).json({ id });
});

router.put('/tags/:id', requireModerator, (req, res) => {
  const existing = getTag.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tag not found' });
  const { tag, error } = cleanTag(req.body, existing.kind);
  if (error) return res.status(400).json({ error });
  if (sameName.get(existing.kind, tag.name, existing.id)) {
    return res.status(400).json({ error: `There's already a tag called "${tag.name}".` });
  }

  db.transaction(() => {
    // Moving to another group puts it at the end of that group.
    const sortOrder = tag.group_id !== existing.group_id
      ? endOfGroup.get(existing.kind, tag.group_id).next
      : existing.sort_order;
    db.prepare(`
      UPDATE tags SET name = @name, aliases = @aliases, group_id = @group_id, color = @color, sort_order = @sort_order
      WHERE id = @id
    `).run({ ...tag, sort_order: sortOrder, id: existing.id });
    const renamed = tag.name !== existing.name ? ` (was "${existing.name}")` : '';
    logModAction(req, 'tag.edit', `tag:${existing.id}`, `Edited tag "${tag.name}"${renamed}`);
  })();
  res.json({ updated: true });
});

// Neighbours within the same kind + group, in display order.
const siblings = db.prepare(`
  SELECT id, sort_order FROM tags WHERE kind = ? AND group_id IS ? AND status = 'approved' ORDER BY sort_order, id
`);
const setSortOrder = db.prepare('UPDATE tags SET sort_order = ? WHERE id = ?');

router.post('/tags/:id/move', requireModerator, (req, res) => {
  const tag = getTag.get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });
  const step = req.body.direction === 'up' ? -1 : req.body.direction === 'down' ? 1 : 0;
  if (!step) return res.status(400).json({ error: 'direction must be up or down' });

  db.transaction(() => {
    // Renumber the group 0, 1, 2… first, so equal or gapped sort_orders can't
    // make a swap do nothing; then swap with the neighbour.
    const list = siblings.all(tag.kind, tag.group_id).map((t) => t.id);
    const i = list.indexOf(tag.id);
    const j = i + step;
    if (i === -1 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((id, n) => setSortOrder.run(n, id));
  })();
  res.json({ moved: true });
});

router.put('/tag-groups/:id', requireModerator, (req, res) => {
  const group = getGroup.get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const color = req.body.color ? String(req.body.color).trim() : null;
  if (color && !isHex(color)) return res.status(400).json({ error: 'Color must be a hex like #7bb0e0, or empty.' });
  db.prepare('UPDATE tag_groups SET color = ? WHERE id = ?').run(color, group.id);
  logModAction(req, 'tag.group_color', `tag-group:${group.id}`, `Set the ${group.name} group color to ${color ?? 'none'}`);
  res.json({ updated: true });
});

export default router;
