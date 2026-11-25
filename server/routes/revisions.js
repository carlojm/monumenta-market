// server/routes/revisions.js
//
// Page revisions (Phase 3), mounted at /api. The rules live in lib/revisions.js.
//   POST /plots/:id/revisions   {action, base?, proposed?, summary?, request_review?}
//        Owners and maintainers (edits to their own shop; only the owner
//        changes the maintainers) and staff publish at once, unless they ask
//        for review; everyone else's edit waits for review. An edit that adds
//        images (uploaded first as drafts, lib/images.js) always waits for a
//        moderator, unless a moderator made it. A player's new suggestion for
//        a plot replaces their earlier pending one.
//   POST /revisions/:id/withdraw            the author cancels a pending one
//   GET  /revisions/pending                 the review queue (staff: all; owners and maintainers: their
//                                           shop, with can_review false where only a mod or the owner may approve)
//   GET  /revisions/mine?offset=&withdrawn= your own edits, newest first, 20 at a time
//   GET  /plots/:id/history?offset=         a plot's saved changes, public, newest first, 20 at a time
//   POST /revisions/:id/approve {values?, note?}  `values` resolves conflicts or fixes typos
//   POST /revisions/:id/reject  {note?}
//   POST /revisions/:id/undo                the author of a Force edit puts the page back
// Every one of these is recorded in the Mod log (lib/revisionLog.js).

import express from 'express';
import db from '../db/init.js';
import { logRevision, shopName, snapshotDiff } from '../lib/revisionLog.js';
import { revisions as revisionLimit } from '../lib/rateLimits.js';
import {
  ACTIONS, MAX_PENDING_PER_ACCOUNT, applyRevision, applyUndo, authorChanged, canPublishEdit, canReview, checkImages,
  cleanBase, cleanNote, cleanSnapshot, discardImages, holdImages, runsShop, isStaff, isStale, mergeEdit, ownersOtherShop,
  parse, preview, publicRevision, recordDirect, recordMove, recordSuggestion, sameSnapshot, snapshotOf, getAccountName,
} from '../lib/revisions.js';
import { SHOP_FIELDS, getCurrentShop, getPlot, getShop } from '../lib/shops.js';
import { tagsForShop } from '../lib/tags.js';

const router = express.Router();

const getRevision = db.prepare('SELECT * FROM revisions WHERE id = ?');
const myPendingHere = db.prepare("SELECT * FROM revisions WHERE author_id = ? AND plot_id = ? AND status = 'pending'");
const withdrawMine = db.prepare(
  "UPDATE revisions SET status = 'withdrawn' WHERE author_id = ? AND plot_id = ? AND status = 'pending'",
);
const countPending = db.prepare("SELECT count(*) AS n FROM revisions WHERE author_id = ? AND status = 'pending'");
const finishReview = db.prepare(`
  UPDATE revisions SET status = @status, reviewer_id = @reviewer_id, review_note = @review_note,
    old_values = @old_values, new_values = @new_values, reviewed_at = CURRENT_TIMESTAMP
  WHERE id = @id AND status = 'pending'
`);
const movedBy = db.prepare("SELECT * FROM revisions WHERE part_of = ? AND action = 'vacate'");
const latestApplied = db.prepare(
  "SELECT id FROM revisions WHERE plot_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 1",
);
const pendingRevisions = db.prepare(`
  SELECT r.*, a.name AS author_name FROM revisions r LEFT JOIN accounts a ON a.id = r.author_id
  WHERE r.status = 'pending' ORDER BY r.created_at, r.id
`);

const json = (v) => (v == null ? null : JSON.stringify(v));
const parsed = (r) => ({ ...r, base: parse(r.base), proposed: parse(r.proposed) });
const credit = (account) => ` (approved by ${account.name})`;

// --- For the Mod log ---

// What a revision asks for: the shop it was made for (`base` is the page as
// its author saw it), and an edit's changes or a new shop's fields.
function asked({ action, base, proposed }) {
  const data = { action, shop: shopName(base) };
  if (action === 'edit') return { ...data, ...snapshotDiff(base, proposed) };
  if (action === 'open') return { ...data, owner: proposed.owner, ...snapshotDiff(null, proposed) };
  return data;
}

// What applying a revision did (`applied` is applyRevision's result).
function made(action, { old_values: before, new_values: after, moved }) {
  const data = { action, shop: shopName(before), moved_from: moved?.shop.plot_id };
  if (action === 'edit') return { ...data, ...snapshotDiff(before, after) };
  if (action === 'open') return { ...data, owner: after.owner, ...snapshotDiff(null, after) };
  return data;
}

// The edit form says how a clash was settled before sending: kept 'mine' or
// 'current' in each field. Only recorded, never trusted for anything else.
function cleanResolved(input) {
  if (!Array.isArray(input)) return null;
  return input.filter((x) => SHOP_FIELDS.includes(x?.field) && ['mine', 'current'].includes(x?.kept))
    .slice(0, SHOP_FIELDS.length).map(({ field, kept }) => ({ field, kept }));
}

// --- Submit ---

router.post('/plots/:id/revisions', revisionLimit, (req, res) => {
  const account = req.account;
  if (!account) return res.status(401).json({ error: 'Link your Minecraft account to edit pages.' });
  const plot = getPlot.get(req.params.id);
  if (!plot) return res.status(404).json({ error: 'Plot not found' });
  const { action } = req.body;
  if (!ACTIONS.includes(action)) return res.status(400).json({ error: `action must be one of ${ACTIONS.join(', ')}` });

  const shop = getCurrentShop.get(plot.id) ?? null;
  const now = snapshotOf(shop);
  let base = now; // for open and vacate, the shop being replaced
  let proposed = null;

  if (action === 'edit') {
    if (!shop) return res.status(409).json({ error: 'This plot has no shop to edit.' });
    const cleanedBase = cleanBase(req.body.base);
    if (cleanedBase.error) return res.status(400).json({ error: cleanedBase.error });
    base = cleanedBase.base;
    const cleaned = cleanSnapshot(req.body.proposed, base);
    if (cleaned.error) return res.status(400).json({ error: cleaned.error });
    proposed = cleaned.snapshot;
    if (!authorChanged(base, proposed)) return res.status(400).json({ error: "You haven't changed anything yet." });
    if (proposed.owner !== base.owner) {
      return res.status(400).json({ error: 'To change the owner, use "A new shop is here" instead.' });
    }
    const imageProblem = checkImages(base, proposed, shop, account);
    if (imageProblem) return res.status(imageProblem.status).json({ error: imageProblem.error });
  } else if (action === 'open') {
    const cleaned = cleanSnapshot(req.body.proposed, null);
    if (cleaned.error) return res.status(400).json({ error: cleaned.error });
    proposed = { ...cleaned.snapshot, image_ids: [], icon_id: null }; // a new shop starts without images
    if (!proposed.owner) return res.status(400).json({ error: 'A new shop needs an owner.' });
    if (shop && proposed.owner.toLowerCase() === shop.owner.toLowerCase()) {
      return res.status(400).json({ error: `${shop.owner} already owns this shop. To change its details, edit it instead.` });
    }
  } else if (!shop) {
    return res.status(409).json({ error: 'This plot is already empty.' });
  }

  const row = { plotId: plot.id, shopId: shop?.id ?? null, action, base, proposed, summary: cleanNote(req.body.summary), account };
  const resolved = cleanResolved(req.body.resolved);

  // Publish at once: the owner editing their shop, or staff.
  if (canPublishEdit(account, action, shop, base, action === 'edit' ? proposed : base) && !req.body.request_review) {
    let values = proposed;
    if (action === 'edit') {
      const merged = mergeEdit(base, proposed, now);
      // The shop changed while they were editing, in the same fields. Send
      // back the live shop so the form can show both and they can choose.
      if (merged.conflicts.length) {
        return res.status(409).json({
          error: 'This page changed while you were editing it.', conflicts: merged.conflicts, current: now,
        });
      }
      values = merged.values;
    }
    const result = db.transaction(() => {
      const applied = applyRevision({ action, plotId: plot.id, shop, values, author: account });
      const id = recordDirect({ ...row, applied });
      if (applied.moved) recordMove({ moved: applied.moved, partOf: id, toPlot: plot.id, account });
      logRevision(req, 'publish', { revisionId: id, plotId: plot.id, ...made(action, applied), summary: row.summary, resolved });
      return { id, changed: applied.changed };
    })();
    return res.status(201).json({ status: 'approved', ...result });
  }

  // Otherwise it waits for review. Their earlier pending edit to this plot is
  // replaced, so reviewers never see near-duplicates.
  const result = db.transaction(() => {
    const earlier = myPendingHere.all(account.id, plot.id);
    const replaced = withdrawMine.run(account.id, plot.id).changes;
    if (countPending.get(account.id).n >= MAX_PENDING_PER_ACCOUNT) {
      return { error: `You have ${MAX_PENDING_PER_ACCOUNT} edits waiting for review. Please wait for some of those first.` };
    }
    // The replaced suggestions' new images go, unless this one keeps them.
    const keep = [...(proposed?.image_ids ?? []), proposed?.icon_id];
    for (const r of earlier) discardImages(parse(r.proposed), keep);
    if (proposed) holdImages(proposed);
    const id = recordSuggestion(row);
    logRevision(req, 'suggest', { revisionId: id, plotId: plot.id, ...asked(row), summary: row.summary, replaced: replaced || null, resolved });
    return { id, replaced };
  })();
  if (result.error) return res.status(429).json({ error: result.error });
  res.status(201).json({ status: 'pending', ...result });
});

// --- Withdraw your own ---

router.post('/revisions/:id/withdraw', (req, res) => {
  if (!req.account) return res.status(401).json({ error: 'Log in first.' });
  const revision = getRevision.get(req.params.id);
  if (!revision || revision.author_id !== req.account.id) return res.status(404).json({ error: 'Edit not found' });
  if (revision.status !== 'pending') return res.status(409).json({ error: 'This edit has already been reviewed.' });
  db.transaction(() => {
    db.prepare("UPDATE revisions SET status = 'withdrawn' WHERE id = ?").run(revision.id);
    discardImages(parse(revision.proposed));
  })();
  logRevision(req, 'withdraw', {
    revisionId: revision.id, plotId: revision.plot_id, ...asked(parsed(revision)), summary: revision.summary,
  });
  res.json({ status: 'withdrawn' });
});

// --- The review queue ---

router.get('/revisions/pending', (req, res) => {
  if (!req.account) return res.status(401).json({ error: 'Log in first.' });
  const staff = isStaff(req.account);
  const list = [];
  for (const r of pendingRevisions.all()) {
    const shop = getCurrentShop.get(r.plot_id) ?? null;
    const reviewable = canReview(req.account, r, shop);
    // Owners and maintainers see every suggestion about their own shop,
    // including ones only a mod (or the owner) can approve, so they know.
    if (!staff && !runsShop(req.account, shop)) continue;
    list.push(publicRevision(r, {
      owner: shop?.owner ?? null,
      // The plot's current shop, so the queue can name it (null when vacant).
      shop: shop ? { owner: shop.owner, shop_name: shop.shop_name, guild_name: shop.guild_name, tags: tagsForShop(shop.id) } : null,
      mine: r.author_id === req.account.id,
      can_review: reviewable,
      ...preview(r, shop),
    }));
  }
  res.json(list);
});

// --- Your edits ---

const MINE_PAGE = 20;
const myRevisions = db.prepare(`
  SELECT r.*, rv.name AS reviewer_name FROM revisions r LEFT JOIN accounts rv ON rv.id = r.reviewer_id
  WHERE r.author_id = @author AND (r.status = 'withdrawn') = @withdrawn AND r.part_of IS NULL
  ORDER BY r.created_at DESC, r.id DESC LIMIT @limit OFFSET @offset
`);
const countWithdrawn = db.prepare("SELECT count(*) FROM revisions WHERE author_id = ? AND status = 'withdrawn'").pluck();

// The account page's "Your edits": everything you've suggested or published,
// newest first. Withdrawn ones (including suggestions you replaced) come
// separately with ?withdrawn=1; the main list says how many there are. Each
// says what it changed (what was saved, once approved; what
// you asked for, otherwise), how it was reviewed and the reviewer's note, and
// `adjusted`: fields you changed that were saved differently (a reviewer fixed
// them or kept a newer version).
router.get('/revisions/mine', (req, res) => {
  if (!req.account) return res.status(401).json({ error: 'Log in first.' });
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  const withdrawn = req.query.withdrawn === '1' ? 1 : 0;
  const rows = myRevisions.all({ author: req.account.id, withdrawn, limit: MINE_PAGE + 1, offset });
  const edits = rows.slice(0, MINE_PAGE).map((r) => {
    const p = parsed(r);
    const applied = r.status === 'approved';
    const after = applied ? parse(r.new_values) : null;
    const adjusted = applied && !r.direct && r.action !== 'vacate'
      ? SHOP_FIELDS.filter((f) => (r.action === 'open' || p.base[f] !== p.proposed[f]) && p.proposed[f] !== after[f])
        .map((f) => ({ field: f, suggested: p.proposed[f], saved: after[f] }))
      : [];
    return {
      id: r.id, plot_id: r.plot_id, status: r.status, direct: !!r.direct, summary: r.summary,
      // A Force edit records its author as the reviewer; no one else reviewed it.
      review_note: r.review_note, reviewer: r.direct ? null : r.reviewer_name ?? null, created_at: r.created_at, reviewed_at: r.reviewed_at,
      ...(applied ? made(r.action, { old_values: parse(r.old_values), new_values: after }) : asked(p)),
      moved_from: movedBy.get(r.id)?.plot_id ?? null,
      adjusted,
    };
  });
  res.json({ edits, hasMore: rows.length > MINE_PAGE, withdrawn: countWithdrawn.get(req.account.id) });
});

// --- A plot's history (3.9) ---

const HISTORY_PAGE = 20;
const EARLIER_MAX = 200;
const plotHistory = db.prepare(`
  SELECT r.*, a.name AS author_name, rv.name AS reviewer_name FROM revisions r
  LEFT JOIN accounts a ON a.id = r.author_id LEFT JOIN accounts rv ON rv.id = r.reviewer_id
  WHERE r.plot_id = ? AND r.status = 'approved'
  ORDER BY r.reviewed_at DESC, r.id DESC LIMIT ? OFFSET ?
`);
const firstRevisionAt = db.prepare("SELECT min(reviewed_at) FROM revisions WHERE plot_id = ? AND status = 'approved'").pluck();
// The card's Update lines from before this plot's first saved revision
// (revisions started 11/20), so older changes still show. Newest first.
const earlierLines = db.prepare(`
  SELECT c.id, c.body, c.author, c.created_at, s.owner, s.shop_name, s.guild_name FROM comments c
  JOIN shops s ON s.id = c.shop_id
  WHERE s.plot_id = @plot AND c.is_system = 1 AND (@before IS NULL OR c.created_at < @before)
  ORDER BY c.created_at DESC, c.id DESC LIMIT @limit
`);

// Public, like a wiki's History tab: only saved changes (approved
// suggestions, Force edits, undos, moves). Suggestions that were rejected or
// withdrawn stay with their author (Your edits) and staff (the Mod log).
// Each: who made it, who approved it (not for a Force edit), when it was
// saved, the summary and the reviewer's note, and what changed (`made`, the
// same as the Mod log). The last page adds `earlier`: older Update lines.
// An edit to the current shop also has `version`: the page as it was right
// after it, for "Restore this version" (sent as a normal edit).
router.get('/plots/:id/history', (req, res) => {
  const plot = getPlot.get(req.params.id);
  if (!plot) return res.status(404).json({ error: 'Plot not found' });
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  const rows = plotHistory.all(plot.id, HISTORY_PAGE + 1, offset);
  const current = getCurrentShop.get(plot.id);
  const changes = rows.slice(0, HISTORY_PAGE).map((r) => ({
    id: r.id, action: r.action, direct: !!r.direct, author: r.author_name ?? null,
    reviewer: r.direct ? null : r.reviewer_name ?? null, summary: r.summary, note: r.review_note,
    saved_at: r.reviewed_at ?? r.created_at, part_of: r.part_of,
    ...made(r.action, { old_values: parse(r.old_values), new_values: parse(r.new_values) }),
    moved_from: movedBy.get(r.id)?.plot_id ?? null,
    ...(r.action === 'edit' && current && r.shop_id === current.id && { version: parse(r.new_values) }),
  }));
  const hasMore = rows.length > HISTORY_PAGE;
  const earlier = hasMore ? undefined : earlierLines.all({ plot: plot.id, before: firstRevisionAt.get(plot.id), limit: EARLIER_MAX })
    .map(({ id, body, author, created_at: at, ...shop }) => ({ id, body, author, created_at: at, shop: shopName(shop) }));
  res.json({ changes, hasMore, ...(earlier && { earlier }) });
});

// --- Approve and reject ---

// Loads a pending revision the account may review, or answers with an error.
function reviewable(req, res) {
  if (!req.account) return void res.status(401).json({ error: 'Log in first.' });
  const revision = getRevision.get(req.params.id);
  if (!revision) return void res.status(404).json({ error: 'Edit not found' });
  if (revision.status !== 'pending') return void res.status(409).json({ error: 'This edit has already been reviewed.' });
  const shop = getCurrentShop.get(revision.plot_id) ?? null;
  if (!canReview(req.account, revision, shop)) return void res.status(403).json({ error: "You can't review this edit." });
  return { revision, shop };
}

router.post('/revisions/:id/approve', (req, res) => {
  const found = reviewable(req, res);
  if (!found) return;
  const { revision, shop } = found;
  if (isStale(revision, shop)) {
    return res.status(409).json({ error: 'This edit was for a shop that has since changed hands, so it can only be rejected.', stale: true });
  }
  const overrides = req.body.values ?? {};
  let values = null;
  // For the log: how each clash was settled, and text the reviewer fixed.
  let resolved = null;
  let suggested = null; // what approving as-is would have saved
  if (revision.action === 'edit') {
    const merged = mergeEdit(parse(revision.base), parse(revision.proposed), snapshotOf(shop));
    const open = merged.conflicts.filter((c) => !(c.field in overrides));
    if (open.length) {
      return res.status(409).json({ error: 'Some fields changed since this edit was made. Choose a value for each.', conflicts: open });
    }
    const cleaned = cleanSnapshot(overrides, merged.values);
    if (cleaned.error) return res.status(400).json({ error: cleaned.error });
    if (cleaned.snapshot.owner !== shop.owner) {
      return res.status(400).json({ error: 'The owner can only change through "A new shop is here".' });
    }
    values = cleaned.snapshot;
    suggested = merged.values;
    resolved = merged.conflicts.map((c) => ({
      field: c.field, kept: values[c.field] === c.mine ? 'mine' : values[c.field] === c.theirs ? 'current' : 'edited',
    }));
  } else if (revision.action === 'open') {
    const cleaned = cleanSnapshot(overrides, parse(revision.proposed));
    if (cleaned.error) return res.status(400).json({ error: cleaned.error });
    if (!cleaned.snapshot.owner) return res.status(400).json({ error: 'A new shop needs an owner.' });
    values = cleaned.snapshot;
    suggested = parse(revision.proposed);
  }
  const clashed = new Set(resolved?.map((x) => x.field));
  const edited = suggested && SHOP_FIELDS.filter((f) => !clashed.has(f) && values[f] !== suggested[f])
    .map((f) => ({ field: f, suggested: suggested[f], saved: values[f] }));

  const author = getAccountName.get(revision.author_id) ?? null;
  const result = db.transaction(() => {
    const applied = applyRevision({
      action: revision.action, plotId: revision.plot_id, shop, values, author, credit: credit(req.account),
    });
    finishReview.run({
      id: revision.id, status: 'approved', reviewer_id: req.account.id, review_note: cleanNote(req.body.note),
      old_values: json(applied.old_values), new_values: json(applied.new_values),
    });
    if (applied.moved) recordMove({ moved: applied.moved, partOf: revision.id, toPlot: revision.plot_id, account: req.account });
    logRevision(req, 'approve', {
      revisionId: revision.id, plotId: revision.plot_id, ...made(revision.action, applied),
      author: author?.name, summary: revision.summary, note: cleanNote(req.body.note), resolved, edited,
    });
    return { changed: applied.changed };
  })();
  res.json({ status: 'approved', ...result });
});

router.post('/revisions/:id/reject', (req, res) => {
  const found = reviewable(req, res);
  if (!found) return;
  const { revision } = found;
  const note = cleanNote(req.body.note);
  db.transaction(() => {
    finishReview.run({
      id: revision.id, status: 'rejected', reviewer_id: req.account.id, review_note: note,
      old_values: null, new_values: null,
    });
    discardImages(parse(revision.proposed));
  })();
  logRevision(req, 'reject', {
    revisionId: revision.id, plotId: revision.plot_id, ...asked(parsed(revision)),
    author: getAccountName.get(revision.author_id)?.name, summary: revision.summary, note,
  });
  res.json({ status: 'rejected' });
});

// --- Undo your own Force edit ---

// Right after a Force edit, its author can put the page back. Only while
// nothing has changed the page since: an undo never throws away someone
// else's later work. After that, it's an ordinary edit.
router.post('/revisions/:id/undo', revisionLimit, (req, res) => {
  const account = req.account;
  if (!account) return res.status(401).json({ error: 'Log in first.' });
  const revision = getRevision.get(req.params.id);
  if (!revision || revision.author_id !== account.id || !revision.direct || revision.status !== 'approved') {
    return res.status(404).json({ error: 'Edit not found' });
  }
  if (revision.part_of) {
    return res.status(409).json({ error: `This was part of #${revision.part_of}. Undo that instead.` });
  }
  const shop = getCurrentShop.get(revision.plot_id) ?? null;
  const row = { ...revision, old_values: parse(revision.old_values), new_values: parse(revision.new_values) };
  const changedSince = latestApplied.get(revision.plot_id).id !== revision.id
    || !sameSnapshot(snapshotOf(shop), row.new_values);
  if (changedSince) {
    return res.status(409).json({ error: 'The page has changed since, so this can no longer be undone. Edit it instead.' });
  }
  // A move closed the owner's old shop too: that plot must be untouched since.
  const moved = movedBy.get(revision.id);
  if (moved && (getCurrentShop.get(moved.plot_id) || latestApplied.get(moved.plot_id)?.id !== moved.id)) {
    return res.status(409).json({ error: `${moved.plot_id} has changed since, so this can no longer be undone. Edit it instead.` });
  }
  // One shop per owner: a shop coming back can't belong to someone who has
  // opened another since.
  const back = [revision.action !== 'edit' && revision.shop_id && getShop.get(revision.shop_id), moved && getShop.get(moved.shop_id)]
    .filter(Boolean);
  for (const s of back) {
    const other = ownersOtherShop(s.owner, revision.plot_id, moved?.plot_id);
    if (other) return res.status(409).json({ error: `${s.owner} has a shop at ${other.plot_id} now, so this can no longer be undone.` });
  }
  // The same rule as making the change now: an owner can undo an edit to
  // their own shop; closing or replacing a shop needs a moderator.
  if (!canPublishEdit(account, revision.action === 'edit' ? 'edit' : 'open', shop, row.new_values, row.old_values)) {
    return res.status(403).json({ error: "You can't undo this edit." });
  }

  const result = db.transaction(() => {
    const applied = applyUndo({ revision: row, shop, account, moved });
    const id = recordDirect({
      plotId: revision.plot_id, shopId: shop?.id ?? null, action: applied.action, base: applied.old_values,
      proposed: applied.new_values, summary: `Undo of #${revision.id}`, account, applied,
    });
    if (moved) {
      recordMove({
        moved: { shop: getShop.get(moved.shop_id), old_values: parse(moved.old_values) },
        partOf: id, toPlot: revision.plot_id, account, reopen: true,
      });
    }
    logRevision(req, 'undo', {
      revisionId: id, plotId: revision.plot_id, ...made(applied.action, applied), undid: revision.id, moved_back: moved?.plot_id,
    });
    return { id, changed: applied.changed };
  })();
  res.status(201).json({ status: 'undone', ...result });
});

export default router;
