// server/routes/revisions.js
//
// Page revisions (Phase 3), mounted at /api. The rules live in lib/revisions.js.
//   POST /plots/:id/revisions   {action, base?, proposed?, summary?, request_review?}
//        Owners (edits to their own shop) and staff publish at once, unless
//        they ask for review; everyone else's edit waits for review. A
//        player's new suggestion for a plot replaces their earlier pending one.
//   POST /revisions/:id/withdraw            the author cancels a pending one
//   GET  /revisions/pending                 the review queue (staff: all; owners: their shop, with
//                                           can_review false where only a mod may approve)
//   POST /revisions/:id/approve {values?, note?}  `values` resolves conflicts or fixes typos
//   POST /revisions/:id/reject  {note?}
//   POST /revisions/:id/undo                the author of a Force edit puts the page back

import express from 'express';
import db from '../db/init.js';
import { logModAction } from '../lib/modlog.js';
import { revisions as revisionLimit } from '../lib/rateLimits.js';
import {
  ACTIONS, MAX_PENDING_PER_ACCOUNT, applyRevision, applyUndo, authorChanged, canPublish, canReview, cleanBase,
  cleanNote, cleanSnapshot, isOwner, isStaff, isStale, mergeEdit, recordDirect, recordSuggestion, sameSnapshot,
  snapshotOf,
} from '../lib/revisions.js';
import { SHOP_FIELDS, getCurrentShop, getPlot } from '../lib/shops.js';

const router = express.Router();

const getRevision = db.prepare('SELECT * FROM revisions WHERE id = ?');
const getAccountName = db.prepare('SELECT id, name FROM accounts WHERE id = ?');
const withdrawMine = db.prepare(
  "UPDATE revisions SET status = 'withdrawn' WHERE author_id = ? AND plot_id = ? AND status = 'pending'",
);
const countPending = db.prepare("SELECT count(*) AS n FROM revisions WHERE author_id = ? AND status = 'pending'");
const finishReview = db.prepare(`
  UPDATE revisions SET status = @status, reviewer_id = @reviewer_id, review_note = @review_note,
    old_values = @old_values, new_values = @new_values, reviewed_at = CURRENT_TIMESTAMP
  WHERE id = @id AND status = 'pending'
`);
const latestApplied = db.prepare(
  "SELECT id FROM revisions WHERE plot_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 1",
);
const pendingRevisions = db.prepare(`
  SELECT r.*, a.name AS author_name FROM revisions r LEFT JOIN accounts a ON a.id = r.author_id
  WHERE r.status = 'pending' ORDER BY r.created_at, r.id
`);

const json = (v) => (v == null ? null : JSON.stringify(v));
const parse = (v) => (v == null ? null : JSON.parse(v));
const credit = (account) => ` (approved by ${account.name})`;

// What a revision looks like to the browser.
function publicRevision(r, extra = {}) {
  return {
    id: r.id, plot_id: r.plot_id, shop_id: r.shop_id, action: r.action, status: r.status,
    direct: !!r.direct, summary: r.summary, review_note: r.review_note,
    author: r.author_name ?? getAccountName.get(r.author_id)?.name ?? null,
    base: parse(r.base), proposed: parse(r.proposed),
    created_at: r.created_at, reviewed_at: r.reviewed_at, ...extra,
  };
}

// What approving would do right now: the fields it changes and any conflicts.
function preview(revision, shop) {
  if (isStale(revision, shop)) return { stale: true, changes: [], conflicts: [] };
  if (revision.action !== 'edit') return { stale: false, changes: [], conflicts: [] };
  const now = snapshotOf(shop);
  const { values, conflicts } = mergeEdit(parse(revision.base), parse(revision.proposed), now);
  const changes = SHOP_FIELDS.filter((f) => values[f] !== now[f]).map((f) => ({ field: f, from: now[f], to: values[f] }));
  const added = values.tag_ids.filter((id) => !now.tag_ids.includes(id));
  const removed = now.tag_ids.filter((id) => !values.tag_ids.includes(id));
  return { stale: false, changes, tags: { added, removed }, conflicts };
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
  } else if (action === 'open') {
    const cleaned = cleanSnapshot(req.body.proposed, null);
    if (cleaned.error) return res.status(400).json({ error: cleaned.error });
    proposed = cleaned.snapshot;
    if (!proposed.owner) return res.status(400).json({ error: 'A new shop needs an owner.' });
    if (shop && proposed.owner.toLowerCase() === shop.owner.toLowerCase()) {
      return res.status(400).json({ error: `${shop.owner} already owns this shop. To change its details, edit it instead.` });
    }
  } else if (!shop) {
    return res.status(409).json({ error: 'This plot is already empty.' });
  }

  const row = { plotId: plot.id, shopId: shop?.id ?? null, action, base, proposed, summary: cleanNote(req.body.summary), account };

  // Publish at once: the owner editing their shop, or staff.
  if (canPublish(account, action, shop) && !req.body.request_review) {
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
      if (isStaff(account)) {
        logModAction(req, `revision.${action}`, `plot:${plot.id}`, `Published an edit (${applied.changed.join(', ') || 'no changes'})`);
      }
      return { id, changed: applied.changed };
    })();
    return res.status(201).json({ status: 'approved', ...result });
  }

  // Otherwise it waits for review. Their earlier pending edit to this plot is
  // replaced, so reviewers never see near-duplicates.
  const result = db.transaction(() => {
    const replaced = withdrawMine.run(account.id, plot.id).changes;
    if (countPending.get(account.id).n >= MAX_PENDING_PER_ACCOUNT) {
      return { error: `You have ${MAX_PENDING_PER_ACCOUNT} edits waiting for review. Please wait for some of those first.` };
    }
    return { id: recordSuggestion(row), replaced };
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
  db.prepare("UPDATE revisions SET status = 'withdrawn' WHERE id = ?").run(revision.id);
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
    // Owners see every suggestion about their own shop, including ones only a
    // mod can approve (like "this plot is now empty"), so they know about them.
    if (!staff && !isOwner(req.account, shop)) continue;
    list.push(publicRevision(r, { owner: shop?.owner ?? null, can_review: reviewable, ...preview(r, shop) }));
  }
  res.json(list);
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
  } else if (revision.action === 'open') {
    const cleaned = cleanSnapshot(overrides, parse(revision.proposed));
    if (cleaned.error) return res.status(400).json({ error: cleaned.error });
    if (!cleaned.snapshot.owner) return res.status(400).json({ error: 'A new shop needs an owner.' });
    values = cleaned.snapshot;
  }

  const author = getAccountName.get(revision.author_id) ?? null;
  const result = db.transaction(() => {
    const applied = applyRevision({
      action: revision.action, plotId: revision.plot_id, shop, values, author, credit: credit(req.account),
    });
    finishReview.run({
      id: revision.id, status: 'approved', reviewer_id: req.account.id, review_note: cleanNote(req.body.note),
      old_values: json(applied.old_values), new_values: json(applied.new_values),
    });
    if (isStaff(req.account)) {
      logModAction(req, 'revision.approve', `plot:${revision.plot_id}`,
        `Approved ${author?.name ?? 'a deleted account'}'s ${revision.action} (${applied.changed.join(', ') || 'no changes left'})`);
    }
    return { changed: applied.changed };
  })();
  res.json({ status: 'approved', ...result });
});

router.post('/revisions/:id/reject', (req, res) => {
  const found = reviewable(req, res);
  if (!found) return;
  const { revision } = found;
  finishReview.run({
    id: revision.id, status: 'rejected', reviewer_id: req.account.id, review_note: cleanNote(req.body.note),
    old_values: null, new_values: null,
  });
  if (isStaff(req.account)) {
    const author = getAccountName.get(revision.author_id);
    logModAction(req, 'revision.reject', `plot:${revision.plot_id}`, `Rejected ${author?.name ?? 'a deleted account'}'s ${revision.action}`);
  }
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
  const shop = getCurrentShop.get(revision.plot_id) ?? null;
  const row = { ...revision, old_values: parse(revision.old_values), new_values: parse(revision.new_values) };
  const changedSince = latestApplied.get(revision.plot_id).id !== revision.id
    || !sameSnapshot(snapshotOf(shop), row.new_values);
  if (changedSince) {
    return res.status(409).json({ error: 'The page has changed since, so this can no longer be undone. Edit it instead.' });
  }
  // The same rule as making the change now: an owner can undo an edit to
  // their own shop; closing or replacing a shop needs a moderator.
  if (!canPublish(account, revision.action === 'edit' ? 'edit' : 'open', shop)) {
    return res.status(403).json({ error: "You can't undo this edit." });
  }

  const result = db.transaction(() => {
    const applied = applyUndo({ revision: row, shop, account });
    const id = recordDirect({
      plotId: revision.plot_id, shopId: shop?.id ?? null, action: applied.action, base: applied.old_values,
      proposed: applied.new_values, summary: `Undo of #${revision.id}`, account, applied,
    });
    if (isStaff(account)) {
      logModAction(req, 'revision.undo', `plot:${revision.plot_id}`, `Undid their ${revision.action} #${revision.id}`);
    }
    return { id, changed: applied.changed };
  })();
  res.status(201).json({ status: 'undone', ...result });
});

export default router;
