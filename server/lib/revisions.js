// server/lib/revisions.js
//
// Page revisions (Phase 3): the rules shared by every way of editing a shop.
// A snapshot is a plain object with every SHOP_FIELDS value plus `tag_ids`,
// `image_ids` (the screenshots, in order) and `icon_id` (3.11). See the
// revisions table in db/init.js for what each snapshot column means.
//
// Merging, per field, between base (what the author saw), proposed (what they
// asked for) and now (the live shop):
//   author didn't change it          -> keep now
//   author changed it, nobody else   -> proposed (a clean change)
//   both changed it to the same      -> nothing to do
//   both changed it differently      -> a conflict for a person to resolve
// Tags and screenshots merge as sets (the author's additions and removals are
// applied to the current ones), so they never conflict; a changed icon wins.
//
// Images are part of edits (decided 11/24). An image row's status:
//   draft     uploaded in the edit form, not sent yet (deleted after a day)
//   pending   part of a suggestion waiting for review
//   approved  on the card
//   removed   taken off by an edit; kept, so undo and history still have it

import db from '../db/init.js';
import { roleOf } from './auth.js';
import { addLogEntry } from './shopLog.js';
import { SHOP_FIELDS, closeShop, openShop, reopenShop } from './shops.js';
import { checkTagIds, setShopTags } from './tags.js';
import { removeImageFiles } from './imageStore.js';

export const ACTIONS = ['edit', 'open', 'vacate'];
export const MAX_PENDING_PER_ACCOUNT = 10;
export const NOTE_MAX = 300; // edit summaries and review notes
const FIELD_LIMITS = {
  owner: 32, maintainers: 400, shop_name: 80, guild_name: 80, description: 4000, stock: 4000,
  palette: 200, guild_color: 40, primary_color: 40, secondary_color: 40,
};
const LABELS = { maintainers: 'maintainers', shop_name: 'shop name', guild_name: 'guild name', guild_color: 'guild color',
  primary_color: 'banner color', secondary_color: 'secondary color' };
// The banner color (the card's top when it has no screenshots) is a real
// color; older colors may still be words, and stay as they are until changed.
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const MAX_SCREENSHOTS = 10;
const label = (f) => LABELS[f] ?? f;

// Maintainers (3.8): Minecraft names, kept as "Alice, Bob". Commas or spaces
// separate them when typed; repeats (ignoring case) are dropped.
export const MAX_MAINTAINERS = 10;
const MINECRAFT_NAME = /^[A-Za-z0-9_]{1,16}$/;
function cleanMaintainers(text) {
  const names = [];
  for (const name of text.split(/[\s,]+/).filter(Boolean)) {
    if (!MINECRAFT_NAME.test(name)) return { error: `"${name}" isn't a Minecraft name.` };
    if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  if (names.length > MAX_MAINTAINERS) return { error: `A shop can have at most ${MAX_MAINTAINERS} maintainers.` };
  return { value: names.join(', ') || null };
}
export const maintainersOf = (shop) => (shop?.maintainers ? shop.maintainers.split(', ') : []);

const tagIdsOf = db.prepare('SELECT tag_id FROM shop_tags WHERE shop_id = ? ORDER BY tag_id');
const sorted = (ids) => [...ids].sort((a, b) => a - b);
const sameTags = (a, b) => a.length === b.length && sorted(a).every((id, i) => id === sorted(b)[i]);
const sameList = (a, b) => (a ?? []).length === (b ?? []).length && (a ?? []).every((id, i) => id === b[i]);

const liveImageIds = db.prepare(
  "SELECT id FROM images WHERE shop_id = ? AND kind = 'gallery' AND status = 'approved' ORDER BY sort_order, id",
).pluck();
const liveIconId = db.prepare(
  "SELECT id FROM images WHERE shop_id = ? AND kind = 'icon' AND status = 'approved' ORDER BY id DESC LIMIT 1",
).pluck();

// One shop per owner (3.12), guild tags included: the owner's current shop
// on any plot other than `plotIds`, or null. Names match ignoring case, like
// Minecraft names.
const ownersShops = db.prepare(`
  SELECT * FROM shops WHERE closed_at IS NULL AND lower(owner) = lower(?) AND plot_id NOT IN (?, ?)
  ORDER BY id LIMIT 1
`);
export const ownersOtherShop = (owner, ...plotIds) =>
  (owner ? ownersShops.get(owner, plotIds[0], plotIds[1] ?? plotIds[0]) ?? null : null);

// The live shop as a snapshot (null for an empty plot).
export function snapshotOf(shop) {
  if (!shop) return null;
  return {
    ...Object.fromEntries(SHOP_FIELDS.map((f) => [f, shop[f] ?? null])),
    tag_ids: tagIdsOf.all(shop.id).map((r) => r.tag_id),
    image_ids: liveImageIds.all(shop.id),
    icon_id: liveIconId.get(shop.id) ?? null,
  };
}

// A list of ids from a request, or null if it isn't one.
const idList = (v) => (Array.isArray(v) && v.every((id) => Number.isInteger(Number(id))) ? [...new Set(v.map(Number))] : null);

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
    if (f === 'primary_color' && text && text !== fallback?.[f] && !HEX_COLOR.test(text)) {
      return { error: 'The banner color must be a color like #3a7bd5.' };
    }
    if (f === 'maintainers' && text) {
      const cleaned = cleanMaintainers(text);
      if (cleaned.error) return cleaned;
      snapshot[f] = cleaned.value;
      continue;
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
  // Images: only their shape here; checkImages says whether they may be used.
  snapshot.image_ids = 'image_ids' in input ? idList(input.image_ids) : fallback?.image_ids ?? [];
  if (!snapshot.image_ids) return { error: 'image_ids must be a list' };
  const icon = 'icon_id' in input ? input.icon_id : fallback?.icon_id ?? null;
  if (icon !== null && !Number.isInteger(Number(icon))) return { error: 'icon_id must be an image id' };
  snapshot.icon_id = icon === null ? null : Number(icon);
  return { snapshot };
}

// A base snapshot from the browser ("what I saw"). Only its shape is checked:
// it describes the past, so its values may be ones we'd no longer accept.
export function cleanBase(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { error: 'base is missing.' };
  const base = Object.fromEntries(SHOP_FIELDS.map((f) => [f, typeof input[f] === 'string' ? input[f].trim() || null : null]));
  base.tag_ids = Array.isArray(input.tag_ids) ? sorted([...new Set(input.tag_ids.map(Number).filter(Number.isInteger))]) : [];
  base.image_ids = idList(input.image_ids) ?? [];
  base.icon_id = Number.isInteger(input.icon_id) ? input.icon_id : null;
  return { base };
}

export const cleanNote = (text) => (typeof text === 'string' ? text.trim().slice(0, NOTE_MAX) || null : null);

// Are two snapshots (or two nulls, for an empty plot) the same page?
export function sameSnapshot(a, b) {
  if (!a || !b) return !a && !b;
  return SHOP_FIELDS.every((f) => (a[f] ?? null) === (b[f] ?? null)) && sameTags(a.tag_ids, b.tag_ids)
    && !changesImages(a, b);
}

// Did the author change anything at all?
export function authorChanged(base, proposed) {
  return SHOP_FIELDS.some((f) => base[f] !== proposed[f]) || !sameTags(base.tag_ids, proposed.tag_ids)
    || changesImages(base, proposed);
}

// --- Images in an edit ---

// Snapshots from before 3.11 have no images, which counts as none.
const imageIdsOf = (s) => [...(s?.image_ids ?? []), ...(s?.icon_id ? [s.icon_id] : [])];
export const changesImages = (a, b) => !sameList(a?.image_ids, b?.image_ids) || (a?.icon_id ?? null) !== (b?.icon_id ?? null);
const getImageRow = db.prepare('SELECT * FROM images WHERE id = ?');

// Does going from `base` to `proposed` show an image no moderator has seen?
// (A draft or a suggestion's; bringing back a removed one, say by undo, doesn't.)
export function addsNewImages(base, proposed) {
  const had = imageIdsOf(base);
  return imageIdsOf(proposed).some((id) => !had.includes(id) && ['draft', 'pending'].includes(getImageRow.get(id)?.status));
}

// Why an edit's images can't be used, or null. Only the people who run the
// shop and staff change them; an added image must be this shop's, of the
// right kind, and the author's own upload (or one the shop had before).
export function checkImages(base, proposed, shop, account) {
  if (!changesImages(base, proposed)) return null;
  if (!isStaff(account) && !runsShop(account, shop)) {
    return { status: 403, error: "Only the shop's owner, its maintainers or a moderator can change its images." };
  }
  if (proposed.image_ids.length > MAX_SCREENSHOTS) {
    return { status: 400, error: `A shop can have at most ${MAX_SCREENSHOTS} screenshots.` };
  }
  const had = imageIdsOf(base);
  for (const id of imageIdsOf(proposed).filter((i) => !had.includes(i))) {
    const image = getImageRow.get(id);
    const usable = image && image.shop_id === shop.id && image.kind === (id === proposed.icon_id ? 'icon' : 'gallery')
      && (image.status === 'draft' ? image.account_id === account.id : ['approved', 'removed'].includes(image.status));
    if (!usable) return { status: 400, error: 'One of the images is no longer there. Please add it again.' };
  }
  return null;
}

// A suggestion's images go from draft to pending: no longer deleted as unsent.
const markPending = db.prepare("UPDATE images SET status = 'pending' WHERE id = ? AND status = 'draft'");
export const holdImages = (proposed) => imageIdsOf(proposed).forEach((id) => markPending.run(id));

// A suggestion that won't be applied (rejected, withdrawn, replaced): its new
// images go, rows now and files after. `keep`: ids still used (a replacing
// suggestion's).
const deleteImageRow = db.prepare('DELETE FROM images WHERE id = ?');
export function discardImages(proposed, keep = []) {
  const gone = imageIdsOf(proposed).filter((id) => !keep.includes(id)).map((id) => getImageRow.get(id))
    .filter((image) => image?.status === 'pending');
  for (const image of gone) deleteImageRow.run(image.id);
  removeImageFiles(gone);
}

// What the browser needs to show an image in an edit (null if it's gone).
export function imageInfo(id) {
  const image = id && getImageRow.get(id);
  return image ? { id: image.id, kind: image.kind, url: image.url, card_url: image.card_url ?? image.url } : null;
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
  // Screenshots: the author's additions after the current ones, minus their
  // removals. Edits from before 3.11 have none, so leave them as they are.
  if (base.image_ids && proposed.image_ids) {
    const addedImages = proposed.image_ids.filter((id) => !base.image_ids.includes(id));
    const removedImages = base.image_ids.filter((id) => !proposed.image_ids.includes(id));
    values.image_ids = [...new Set([...now.image_ids, ...addedImages])].filter((id) => !removedImages.includes(id));
  }
  if ((base.icon_id ?? null) !== (proposed.icon_id ?? null)) values.icon_id = proposed.icon_id ?? null;
  return { values, conflicts };
}

// Who may do what. `shop` is the plot's current shop (or null).
// The check is always here on the server, never only in the browser.
export const isStaff = (account) => ['moderator', 'admin'].includes(roleOf(account));
export const isOwner = (account, shop) =>
  !!account && !!shop?.owner && account.name.toLowerCase() === shop.owner.trim().toLowerCase();
export const isMaintainer = (account, shop) =>
  !!account && maintainersOf(shop).some((n) => n.toLowerCase() === account.name.toLowerCase());
// The owner and maintainers run the shop: they see and review its suggestions.
export const runsShop = (account, shop) => isOwner(account, shop) || isMaintainer(account, shop);
// Does going from `a` to `b` change who the maintainers are? (Snapshots from
// before 3.8 have no maintainers, which counts as none.)
export const changesMaintainers = (a, b) => (a?.maintainers ?? null) !== (b?.maintainers ?? null);
// The owner and maintainers edit their own shop directly, but only the owner
// changes who the maintainers are (3.8). A new owner or an empty plot needs staff.
export const canPublish = (account, action, shop, maintainersChange = false) => isStaff(account)
  || (action === 'edit' && (isOwner(account, shop) || (!maintainersChange && isMaintainer(account, shop))));
// New images (11/24) always need staff: a moderator checks every picture.
export const canPublishEdit = (account, action, shop, base, proposed) =>
  canPublish(account, action, shop, changesMaintainers(base, proposed)) && (isStaff(account) || !addsNewImages(base, proposed));
// You can approve an edit exactly when you could have published it yourself,
// including your own (a mod who queued an edit to double-check it later).
export const canReview = (account, revision, shop) => !!account
  && canPublishEdit(account, revision.action, shop, parse(revision.base), parse(revision.proposed));

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
  if (revision.action === 'open') {
    const from = ownersOtherShop(parse(revision.proposed).owner, revision.plot_id);
    return { stale: false, changes: [], conflicts: [], moves_from: from?.plot_id ?? null };
  }
  if (revision.action !== 'edit') return { stale: false, changes: [], conflicts: [] };
  const now = snapshotOf(shop);
  const { values, conflicts } = mergeEdit(parse(revision.base), parse(revision.proposed), now);
  const changes = SHOP_FIELDS.filter((f) => values[f] !== now[f]).map((f) => ({ field: f, from: now[f], to: values[f] }));
  const added = values.tag_ids.filter((id) => !now.tag_ids.includes(id));
  const removed = now.tag_ids.filter((id) => !values.tag_ids.includes(id));
  return { stale: false, changes, tags: { added, removed }, ...imageChanges(now, values), conflicts };
}

// The images going from one snapshot to the other, for showing an edit:
// `images` { added, removed } and `icon` { from, to } (null if unchanged),
// each image as imageInfo.
export function imageChanges(before, after) {
  const was = before?.image_ids ?? [];
  const now = after?.image_ids ?? [];
  const info = (ids) => ids.map(imageInfo).filter(Boolean);
  const icon = (before?.icon_id ?? null) !== (after?.icon_id ?? null)
    ? { from: imageInfo(before?.icon_id), to: imageInfo(after?.icon_id) } : null;
  return { images: { added: info(now.filter((id) => !was.includes(id))), removed: info(was.filter((id) => !now.includes(id))) }, icon };
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

// The other half of a move (applyRevision's `moved`): the owner's old shop
// closing, in that plot's history, as part of revision `partOf`. Undoing
// `partOf` reopens it. `reopen` saves the undo's half the other way round.
const insertPart = db.prepare('UPDATE revisions SET part_of = ? WHERE id = ?');
export function recordMove({ moved, partOf, toPlot, account, reopen = false }) {
  const { shop, old_values: values } = moved;
  const id = recordDirect({
    plotId: shop.plot_id, shopId: shop.id, action: reopen ? 'open' : 'vacate', base: reopen ? null : values,
    proposed: reopen ? values : null, summary: reopen ? `Undo of the move to ${toPlot}` : `${shop.owner} moved to ${toPlot}`,
    account, applied: reopen ? { old_values: null, new_values: values } : { old_values: values, new_values: null },
  });
  insertPart.run(partOf, id);
  return id;
}

// The shop's images to match `values` (an edit's final snapshot): its
// screenshots approved in their order, ones it dropped removed, and the same
// for the icon. Returns what changed, for applyRevision.
const approveImage = db.prepare("UPDATE images SET status = 'approved', sort_order = ? WHERE id = ?");
const removeImage = db.prepare("UPDATE images SET status = 'removed' WHERE id = ?");
function applyImages(shopId, old, values, author, credit) {
  const changed = [];
  const added = values.image_ids.filter((id) => !old.image_ids.includes(id));
  const removed = old.image_ids.filter((id) => !values.image_ids.includes(id));
  values.image_ids.forEach((id, i) => approveImage.run(i, id));
  for (const id of removed) removeImage.run(id);
  if (added.length || removed.length) {
    const count = (n, verb) => n && `${verb} ${n} screenshot${n === 1 ? '' : 's'}`;
    addLogEntry(shopId, author, `${[count(added.length, 'added'), count(removed.length, 'removed')].filter(Boolean).join(', ')}${credit}`);
    changed.push('screenshots');
  }
  if ((values.icon_id ?? null) !== old.icon_id) {
    if (old.icon_id) removeImage.run(old.icon_id);
    if (values.icon_id) approveImage.run(0, values.icon_id);
    addLogEntry(shopId, author, `icon ${values.icon_id ? (old.icon_id ? 'replaced' : 'added') : 'removed'}${credit}`);
    changed.push('icon');
  }
  return changed;
}

const updateShop = (shopId, values, fields) => db.prepare(
  `UPDATE shops SET ${[...fields.map((f) => `${f} = @${f}`), 'updated_at = CURRENT_TIMESTAMP'].join(', ')} WHERE id = @id`,
).run({ ...Object.fromEntries(fields.map((f) => [f, values[f]])), id: shopId });

// Writes a revision to the shop. Call inside a transaction. `values` is the
// final snapshot for 'edit' and 'open' (unused for 'vacate'). `credit` is
// appended to each shop log line, e.g. " (approved by Fulan)".
// Returns { old_values, new_values, changed } for the revisions row. An
// 'open' for an owner with a shop elsewhere is a move: that shop closes too,
// and `moved` is { shop, old_values } for recordMove.
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
    const from = ownersOtherShop(values.owner, plotId);
    const moved = from && { shop: from, old_values: snapshotOf(from) };
    if (from) {
      closeShop.run(from.id);
      addLogEntry(from.id, author, `Shop closed, ${values.owner} moved to ${plotId}${credit}`);
    }
    const opened = openShop(plotId, values, author);
    if (values.tag_ids.length) {
      const { added } = setShopTags(opened, values.tag_ids);
      addLogEntry(opened, author, `tags set: ${added.join(', ')}${credit}`);
    }
    return { old_values: old, new_values: { ...values }, changed: ['open'], opened, moved };
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
  // The admin editor sends no images: those stay as they are.
  const imagesChanged = 'image_ids' in values ? applyImages(shop.id, old, values, author, credit) : [];
  // Tag- and image-only edits still count as an update to the page.
  if (fields.length || added.length || removed.length || imagesChanged.length) updateShop(shop.id, values, fields);
  const changed = [...fields, ...(added.length || removed.length ? ['tags'] : []), ...imagesChanged];
  return { old_values: old, new_values: snapshotOf({ ...values, id: shop.id }), changed };
}

// Undoes a direct revision (3.3e). Call inside a transaction, after checking
// the page is still exactly as it left it. `revision` is the row, with
// old_values and new_values parsed; `moved` is the row recordMove saved for
// it, if any. Returns { action, old_values, new_values, changed } for the new
// revisions row: the undo is saved as the change it makes.
export function applyUndo({ revision, shop, account, moved = null }) {
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
  // The owner had moved here: their old shop opens again.
  if (moved) {
    reopenShop.run(moved.shop_id);
    addLogEntry(moved.shop_id, account, `Shop reopened${credit}`);
  }
  return {
    action: revision.shop_id ? 'open' : 'vacate',
    old_values: revision.new_values,
    new_values: revision.old_values,
    changed: [revision.shop_id ? 'reopen' : 'vacate'],
  };
}
