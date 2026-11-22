// server/lib/revisions.js
//
// Page revisions (Phase 3): the rules shared by every way of editing a shop.
// A snapshot is a plain object with every SHOP_FIELDS value plus `tag_ids`.
// See the revisions table in db/init.js for what each snapshot column means.
//
// Merging, per field, between base (what the author saw), proposed (what they
// asked for) and now (the live shop):
//   author didn't change it          -> keep now
//   author changed it, nobody else   -> proposed (a clean change)
//   both changed it to the same      -> nothing to do
//   both changed it differently      -> a conflict for a person to resolve
// Tags merge as a set (the author's additions and removals are applied to the
// current tags), so they never conflict.

import db from '../db/init.js';
import { roleOf } from './auth.js';
import { addLogEntry } from './shopLog.js';
import { SHOP_FIELDS, closeShop, openShop, reopenShop } from './shops.js';
import { checkTagIds, setShopTags } from './tags.js';

export const ACTIONS = ['edit', 'open', 'vacate'];
export const MAX_PENDING_PER_ACCOUNT = 10;
export const NOTE_MAX = 300; // edit summaries and review notes
const FIELD_LIMITS = {
  owner: 32, shop_name: 80, guild_name: 80, description: 4000, stock: 4000,
  palette: 200, guild_color: 40, primary_color: 40, secondary_color: 40,
};
const LABELS = { shop_name: 'shop name', guild_name: 'guild name', guild_color: 'guild color',
  primary_color: 'primary color', secondary_color: 'secondary color' };
const label = (f) => LABELS[f] ?? f;

const tagIdsOf = db.prepare('SELECT tag_id FROM shop_tags WHERE shop_id = ? ORDER BY tag_id');
const sorted = (ids) => [...ids].sort((a, b) => a - b);
const sameTags = (a, b) => a.length === b.length && sorted(a).every((id, i) => id === sorted(b)[i]);

// The live shop as a snapshot (null for an empty plot).
export function snapshotOf(shop) {
  if (!shop) return null;
  return {
    ...Object.fromEntries(SHOP_FIELDS.map((f) => [f, shop[f] ?? null])),
    tag_ids: tagIdsOf.all(shop.id).map((r) => r.tag_id),
  };
}

// Checks shop values from a request. `fallback` fills in anything the request
// leaves out, so a partial request never blanks a field by accident. Blank
// text means "not set". Tags must be approved, except ones already in
// `fallback` (a shop can keep a tag that was later unapproved).
// Returns { snapshot } or { error }.
export function cleanSnapshot(input, fallback) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { error: 'Shop values are missing.' };
  const snapshot = {};
  for (const f of SHOP_FIELDS) {
    if (!(f in input)) {
      snapshot[f] = fallback?.[f] ?? null;
      continue;
    }
    const v = input[f];
    if (v !== null && typeof v !== 'string') return { error: `${label(f)} must be text.` };
    const text = v?.trim() || null;
    if (text && text.length > FIELD_LIMITS[f]) {
      return { error: `The ${label(f)} can be at most ${FIELD_LIMITS[f]} characters.` };
    }
    snapshot[f] = text;
  }
  if (!('tag_ids' in input)) {
    snapshot.tag_ids = fallback?.tag_ids ?? [];
  } else {
    if (!Array.isArray(input.tag_ids)) return { error: 'tag_ids must be a list' };
    const kept = new Set(fallback?.tag_ids ?? []);
    const ids = [...new Set(input.tag_ids.map(Number))];
    const checked = checkTagIds(ids.filter((id) => !kept.has(id)));
    if (checked.error) return { error: checked.error };
    snapshot.tag_ids = sorted(ids);
  }
  return { snapshot };
}

// A base snapshot from the browser ("what I saw"). Only its shape is checked:
// it describes the past, so its values may be ones we'd no longer accept.
export function cleanBase(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { error: 'base is missing.' };
  const base = Object.fromEntries(SHOP_FIELDS.map((f) => [f, typeof input[f] === 'string' ? input[f].trim() || null : null]));
  base.tag_ids = Array.isArray(input.tag_ids) ? sorted([...new Set(input.tag_ids.map(Number).filter(Number.isInteger))]) : [];
  return { base };
}

export const cleanNote = (text) => (typeof text === 'string' ? text.trim().slice(0, NOTE_MAX) || null : null);

// Are two snapshots (or two nulls, for an empty plot) the same page?
export function sameSnapshot(a, b) {
  if (!a || !b) return !a && !b;
  return SHOP_FIELDS.every((f) => (a[f] ?? null) === (b[f] ?? null)) && sameTags(a.tag_ids, b.tag_ids);
}

// Did the author change anything at all?
export function authorChanged(base, proposed) {
  return SHOP_FIELDS.some((f) => base[f] !== proposed[f]) || !sameTags(base.tag_ids, proposed.tag_ids);
}

// Merges an edit onto the live shop. Returns { values, conflicts }: `values`
// is the resulting snapshot (conflicting fields keep the live value until
// resolved), and each conflict is { field, base, mine, theirs }.
export function mergeEdit(base, proposed, now) {
  const values = { ...now };
  const conflicts = [];
  for (const f of SHOP_FIELDS) {
    if (base[f] === proposed[f]) continue; // the author didn't touch it
    if (now[f] === base[f]) values[f] = proposed[f]; // nobody else did either
    else if (now[f] !== proposed[f]) conflicts.push({ field: f, base: base[f], mine: proposed[f], theirs: now[f] });
  }
  const added = proposed.tag_ids.filter((id) => !base.tag_ids.includes(id));
  const removed = base.tag_ids.filter((id) => !proposed.tag_ids.includes(id));
  values.tag_ids = sorted([...new Set([...now.tag_ids, ...added])].filter((id) => !removed.includes(id)));
  return { values, conflicts };
}

// Who may do what. `shop` is the plot's current shop (or null).
export const isStaff = (account) => ['moderator', 'admin'].includes(roleOf(account));
export const isOwner = (account, shop) =>
  !!account && !!shop?.owner && account.name.toLowerCase() === shop.owner.trim().toLowerCase();
// Owners can only edit their own shop; a new owner or an empty plot needs staff.
export const canPublish = (account, action, shop) => isStaff(account) || (action === 'edit' && isOwner(account, shop));
// You can approve an edit exactly when you could have published it yourself,
// including your own (a mod who queued an edit to double-check it later).
export const canReview = (account, revision, shop) => !!account && canPublish(account, revision.action, shop);

// Is the plot still in the state the revision was made for? An edit or vacate
// needs the same shop; an open needs the same shop (or still none) it replaces.
export const isStale = (revision, shop) => (revision.shop_id ?? null) !== (shop?.id ?? null);

// --- Showing revisions ---

export const parse = (v) => (v == null ? null : JSON.parse(v));
export const getAccountName = db.prepare('SELECT id, name FROM accounts WHERE id = ?');

// What a revision looks like to the browser.
export function publicRevision(r, extra = {}) {
  return {
    id: r.id, plot_id: r.plot_id, shop_id: r.shop_id, action: r.action, status: r.status,
    direct: !!r.direct, summary: r.summary, review_note: r.review_note,
    author: r.author_name ?? getAccountName.get(r.author_id)?.name ?? null,
    base: parse(r.base), proposed: parse(r.proposed),
    created_at: r.created_at, reviewed_at: r.reviewed_at, ...extra,
  };
}

// What approving would do right now: the fields it changes and any conflicts.
export function preview(revision, shop) {
  if (isStale(revision, shop)) return { stale: true, changes: [], conflicts: [] };
  if (revision.action !== 'edit') return { stale: false, changes: [], conflicts: [] };
  const now = snapshotOf(shop);
  const { values, conflicts } = mergeEdit(parse(revision.base), parse(revision.proposed), now);
  const changes = SHOP_FIELDS.filter((f) => values[f] !== now[f]).map((f) => ({ field: f, from: now[f], to: values[f] }));
  const added = values.tag_ids.filter((id) => !now.tag_ids.includes(id));
  const removed = now.tag_ids.filter((id) => !values.tag_ids.includes(id));
  return { stale: false, changes, tags: { added, removed }, conflicts };
}

// A plot's suggestions waiting for review, oldest first, for its card (3.6).
// Public, like a wiki's pending changes: anyone can see what's suggested and
// by whom. `mine` and `can_review` are for the account viewing (or null).
const pendingOnPlot = db.prepare(`
  SELECT r.*, a.name AS author_name FROM revisions r LEFT JOIN accounts a ON a.id = r.author_id
  WHERE r.plot_id = ? AND r.status = 'pending' ORDER BY r.created_at, r.id
`);
export function pendingForPlot(plotId, shop, account) {
  return pendingOnPlot.all(plotId).map((r) => publicRevision(r, {
    mine: !!account && r.author_id === account.id,
    can_review: canReview(account, r, shop),
    ...preview(r, shop),
  }));
}

// --- Saving revision rows ---

const insertRevision = db.prepare(`
  INSERT INTO revisions (plot_id, shop_id, action, base, proposed, summary, author_id, direct, status,
    reviewer_id, old_values, new_values, reviewed_at)
  VALUES (@plot_id, @shop_id, @action, @base, @proposed, @summary, @author_id, @direct, @status,
    @reviewer_id, @old_values, @new_values, CASE WHEN @direct = 1 THEN CURRENT_TIMESTAMP END)
`);
const json = (v) => (v == null ? null : JSON.stringify(v));

// A suggestion waiting for review. Returns its id.
export function recordSuggestion({ plotId, shopId, action, base, proposed, summary = null, account }) {
  return insertRevision.run({
    plot_id: plotId, shop_id: shopId, action, base: json(base), proposed: json(proposed), summary,
    author_id: account.id, direct: 0, status: 'pending', reviewer_id: null, old_values: null, new_values: null,
  }).lastInsertRowid;
}

// An edit applied at once by an owner or staff (`applied` is applyRevision's
// result). `account` is null for the emergency ADMIN_TOKEN. Returns its id.
export function recordDirect({ plotId, shopId, action, base, proposed, summary = null, account, applied }) {
  return insertRevision.run({
    plot_id: plotId, shop_id: shopId, action, base: json(base), proposed: json(proposed), summary,
    author_id: account?.id ?? null, direct: 1, status: 'approved', reviewer_id: account?.id ?? null,
    old_values: json(applied.old_values), new_values: json(applied.new_values),
  }).lastInsertRowid;
}

const updateShop = (shopId, values, fields) => db.prepare(
  `UPDATE shops SET ${[...fields.map((f) => `${f} = @${f}`), 'updated_at = CURRENT_TIMESTAMP'].join(', ')} WHERE id = @id`,
).run({ ...Object.fromEntries(fields.map((f) => [f, values[f]])), id: shopId });

// Writes a revision to the shop. Call inside a transaction. `values` is the
// final snapshot for 'edit' and 'open' (unused for 'vacate'). `credit` is
// appended to each shop log line, e.g. " (approved by Fulan)".
// Returns { old_values, new_values, changed } for the revisions row.
export function applyRevision({ action, plotId, shop, values, author, credit = '' }) {
  const old = snapshotOf(shop);
  if (action === 'vacate') {
    closeShop.run(shop.id);
    addLogEntry(shop.id, author, `Shop closed, plot is now vacant${credit}`);
    return { old_values: old, new_values: null, changed: ['vacate'] };
  }
  if (action === 'open') {
    if (shop) {
      closeShop.run(shop.id);
      addLogEntry(shop.id, author, `Shop closed, plot taken over by ${values.owner}${credit}`);
    }
    const opened = openShop(plotId, values, author);
    if (values.tag_ids.length) {
      const { added } = setShopTags(opened, values.tag_ids);
      addLogEntry(opened, author, `tags set: ${added.join(', ')}${credit}`);
    }
    return { old_values: old, new_values: { ...values }, changed: ['open'], opened };
  }
  // 'edit'
  const fields = SHOP_FIELDS.filter((f) => values[f] !== old[f]);
  for (const f of fields) {
    addLogEntry(shop.id, author, `${label(f)} updated from "${old[f] ?? '(empty)'}" to "${values[f] ?? '(empty)'}"${credit}`);
  }
  const { added, removed } = setShopTags(shop.id, values.tag_ids);
  if (added.length || removed.length) {
    const parts = [added.length && `added ${added.join(', ')}`, removed.length && `removed ${removed.join(', ')}`];
    addLogEntry(shop.id, author, `tags updated: ${parts.filter(Boolean).join('; ')}${credit}`);
  }
  // Tag-only edits still count as an update to the page.
  if (fields.length || added.length || removed.length) updateShop(shop.id, values, fields);
  const changed = [...fields, ...(added.length || removed.length ? ['tags'] : [])];
  return { old_values: old, new_values: snapshotOf({ ...values, id: shop.id }), changed };
}

// Undoes a direct revision (3.3e). Call inside a transaction, after checking
// the page is still exactly as it left it. `revision` is the row, with
// old_values and new_values parsed. Returns { action, old_values, new_values,
// changed } for the new revisions row: the undo is saved as the change it makes.
export function applyUndo({ revision, shop, account }) {
  const credit = ` (undo of #${revision.id})`;
  if (revision.action === 'edit') {
    const applied = applyRevision({ action: 'edit', plotId: revision.plot_id, shop, values: revision.old_values, author: account, credit });
    return { action: 'edit', ...applied };
  }
  // A new shop was opened here: close it, and bring back the one it replaced.
  // "The plot is now empty": bring the closed shop back.
  if (shop) {
    closeShop.run(shop.id);
    addLogEntry(shop.id, account, `Shop closed${credit}`);
  }
  if (revision.shop_id) {
    reopenShop.run(revision.shop_id);
    addLogEntry(revision.shop_id, account, `Shop reopened${credit}`);
  }
  return {
    action: revision.shop_id ? 'open' : 'vacate',
    old_values: revision.new_values,
    new_values: revision.old_values,
    changed: [revision.shop_id ? 'reopen' : 'vacate'],
  };
}
