// server/routes/adminTags.js
//
// Tag management for moderators and admins, mounted at /api/admin.
//   GET  /tags                       every tag in display order, with how many shops use it
//   POST /tags {kind, name, aliases?, group_id?, color?}   add (goes to the end of its group)
//   PUT  /tags/:id {name, aliases, group_id, color}        edit (a new group puts it at the end)
//   POST /tags/:id/move {direction: up|down}               swap with its neighbour in the group
//   PUT  /tag-groups/:id {color}                           a group's fallback color
//   POST /tags/:id/approve {add_to_shop?}                  approve a suggestion (to the end of its group)
//   POST /tags/:id/reject                                  reject (delete) a suggestion
//   POST /tags/auto-apply {shops: [{plot_id, tag_ids}]}    add tags to many shops (never removes)
//
// Once tags are edited here, the site is the real list: rerunning tags:load
// would overwrite these edits with tags.json.

import express from 'express';
import db from '../db/init.js';
import { requireModerator } from '../middleware/adminAuth.js';
import { logModAction } from '../lib/modlog.js';
import { KINDS, checkTagIds, cleanTag, endOfGroup, isHex, sameName, setShopTags } from '../lib/tags.js';
import { addLogEntry } from '../lib/shopLog.js';

// requireModerator goes on each route: other /api/admin routes have their own checks.
const router = express.Router();

const getTag = db.prepare('SELECT * FROM tags WHERE id = ?');
const getGroup = db.prepare('SELECT * FROM tag_groups WHERE id = ?');

const listTags = db.prepare(`
  SELECT t.id, t.kind, t.name, t.aliases, t.color, t.group_id, t.sort_order, t.status, t.created_at,
    COALESCE(t.color, g.color) AS effective_color,
    a.name AS suggested_by_name, sp.plot_id AS suggested_for_plot, sp.owner AS suggested_for_owner,
    (sp.id IS NOT NULL AND sp.closed_at IS NULL) AS suggested_for_shop_open,
    (SELECT COUNT(*) FROM shop_tags st JOIN shops s ON s.id = st.shop_id
     WHERE st.tag_id = t.id AND s.closed_at IS NULL) AS shop_count
  FROM tags t
  LEFT JOIN tag_groups g ON g.id = t.group_id
  LEFT JOIN accounts a ON a.id = t.suggested_by
  LEFT JOIN shops sp ON sp.id = t.suggested_for_shop_id
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

// Approving a suggestion puts it at the end of its group. With add_to_shop, it's
// also added to the shop it was suggested for (if that shop is still open),
// logged on the card as added by the player who suggested it.
router.post('/tags/:id/approve', requireModerator, (req, res) => {
  const tag = getTag.get(req.params.id);
  if (!tag || tag.status !== 'pending') return res.status(404).json({ error: 'Suggestion not found' });

  const addedTo = db.transaction(() => {
    db.prepare("UPDATE tags SET status = 'approved', sort_order = ? WHERE id = ?")
      .run(endOfGroup.get(tag.kind, tag.group_id).next, tag.id);
    let shop = null;
    if (req.body.add_to_shop && tag.suggested_for_shop_id) {
      shop = db.prepare('SELECT * FROM shops WHERE id = ? AND closed_at IS NULL').get(tag.suggested_for_shop_id);
      if (shop) {
        db.prepare('INSERT OR IGNORE INTO shop_tags (shop_id, tag_id) VALUES (?, ?)').run(shop.id, tag.id);
        const suggester = tag.suggested_by ? db.prepare('SELECT id, name FROM accounts WHERE id = ?').get(tag.suggested_by) : null;
        addLogEntry(shop.id, suggester, `tag added: ${tag.name}`);
      }
    }
    logModAction(req, 'tag.approve', `tag:${tag.id}`,
      `Approved suggested ${tag.kind === 'category' ? 'category' : 'tag'} "${tag.name}"${shop ? ` and added it to ${shop.owner}'s shop` : ''}`);
    return shop?.plot_id ?? null;
  })();
  res.json({ approved: true, added_to: addedTo });
});

router.post('/tags/:id/reject', requireModerator, (req, res) => {
  const tag = getTag.get(req.params.id);
  if (!tag || tag.status !== 'pending') return res.status(404).json({ error: 'Suggestion not found' });
  db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
  logModAction(req, 'tag.reject', `tag:${tag.id}`, `Rejected suggested tag "${tag.name}"`);
  res.json({ rejected: true });
});

// Auto-tagging from descriptions: the matching runs in the browser (the same
// as the Edit tags popup's suggestions) and staff tick which ones to keep.
// This only adds tags, never removes them. Each shop gets a log line on its
// card; the mod log gets one summary. updated_at isn't touched, since nothing
// about the shop itself changed.
const MAX_AUTO_TAG_SHOPS = 500;
const currentShop = db.prepare('SELECT * FROM shops WHERE plot_id = ? AND closed_at IS NULL');
const shopTagIds = db.prepare('SELECT tag_id FROM shop_tags WHERE shop_id = ?');

router.post('/tags/auto-apply', requireModerator, (req, res) => {
  const list = req.body.shops;
  if (!Array.isArray(list) || list.length > MAX_AUTO_TAG_SHOPS) {
    return res.status(400).json({ error: `shops must be a list of at most ${MAX_AUTO_TAG_SHOPS}` });
  }
  const work = [];
  for (const item of list) {
    const shop = currentShop.get(String(item?.plot_id));
    if (!shop) return res.status(400).json({ error: `No current shop on plot ${item?.plot_id}` });
    const checked = checkTagIds(item.tag_ids);
    if (checked.error) return res.status(400).json({ error: checked.error });
    work.push({ shop, ids: checked.ids });
  }

  const result = db.transaction(() => {
    let shops = 0;
    let tags = 0;
    for (const { shop, ids } of work) {
      const current = shopTagIds.all(shop.id).map((r) => r.tag_id);
      const { added } = setShopTags(shop.id, [...new Set([...current, ...ids])]);
      if (!added.length) continue;
      addLogEntry(shop.id, req.account, `tags added: ${added.join(', ')}`);
      shops++;
      tags += added.length;
    }
    if (shops) logModAction(req, 'tag.auto', 'tags', `Auto-tagged ${shops} shops from their descriptions (${tags} tags)`);
    return { shops, tags };
  })();
  res.json(result);
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
