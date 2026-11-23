// server/lib/revisionLog.js
//
// Mod log entries for page revisions (3.13): every suggestion, Force edit,
// withdrawal, review and undo, by anyone. Each entry has a readable line
// (`details`) and the specifics as JSON (`data`), so the Mod log can show
// exactly what changed:
//   action     'edit' | 'open' | 'vacate'
//   shop       the shop's display name (for 'open', the one it replaces)
//   owner      a new shop's owner ('open')
//   author     who made the revision, when someone else reviews it
//   changes    [{ field, from, to }]
//   tags       { added: [name], removed: [name] }
//   summary    the author's "What did you change?" note
//   note       the reviewer's note (a reason, when rejecting)
//   resolved   [{ field, kept: 'mine' | 'current' | 'edited' }] where the page
//              had changed in the same field; 'mine' is the edit's version
//   edited     [{ field, suggested, saved }] text a reviewer fixed while approving
//   replaced   how many earlier suggestions of theirs this one replaced
//   undid      the revision an undo reversed
//   moved_from a new shop's owner had a shop on this plot, now closed (3.12)
//   moved_back an undo also reopened the owner's shop on this plot

import db from '../db/init.js';
import { logModAction } from './modlog.js';
import { SHOP_FIELDS } from './shops.js';

const tagName = db.prepare('SELECT name FROM tags WHERE id = ?').pluck();

// The names the site shows (client/src/lib/shopFields.js).
const LABELS = {
  owner: 'Owner', shop_name: 'Shop name', guild_name: 'Guild name', description: 'About', stock: 'Keywords',
  palette: 'Palette', guild_color: 'Guild color', primary_color: 'Primary color', secondary_color: 'Secondary color',
};

export const shopName = (s) => s?.shop_name || s?.guild_name || s?.owner || null;

// Field by field, what differs between two snapshots (either may be null).
export function snapshotDiff(before, after) {
  const changes = SHOP_FIELDS.filter((f) => (before?.[f] ?? null) !== (after?.[f] ?? null))
    .map((f) => ({ field: f, from: before?.[f] ?? null, to: after?.[f] ?? null }));
  const was = before?.tag_ids ?? [];
  const now = after?.tag_ids ?? [];
  const names = (ids) => ids.map((id) => tagName.get(id) ?? `#${id}`);
  return {
    changes,
    tags: { added: names(now.filter((id) => !was.includes(id))), removed: names(was.filter((id) => !now.includes(id))) },
  };
}

// "About, Palette and tags"
function fieldList({ changes = [], tags }) {
  const parts = changes.map((c) => LABELS[c.field] ?? c.field);
  if (tags?.added.length || tags?.removed.length) parts.push('tags');
  if (parts.length < 2) return parts[0] ?? 'nothing';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

// What the revision does, as a phrase: "an edit to Slime Shop (About and tags)".
function what(d) {
  if (d.action === 'vacate') return `closing ${d.shop ?? 'the shop'} (the plot is now empty)`;
  if (d.action === 'open') {
    return `a new shop by ${d.owner}${d.shop ? `, replacing ${d.shop}` : ''}${d.moved_from ? `, moving from ${d.moved_from}` : ''}`;
  }
  return `an edit to ${d.shop ?? 'the shop'} (${fieldList(d)})`;
}

const SENTENCES = {
  suggest: (d) => `Suggested ${what(d)}`,
  publish: (d) => `Force edited: ${what(d)}`,
  withdraw: (d) => `Withdrew their suggestion: ${what(d)}`,
  approve: (d) => `Approved ${d.author ?? 'a deleted account'}'s suggestion: ${what(d)}${d.edited?.length ? ', with changes' : ''}`,
  reject: (d) => `Rejected ${d.author ?? 'a deleted account'}'s suggestion: ${what(d)}`,
  // An undone new shop or closure is saved as the change it makes.
  undo: (d) => `Undid their Force edit #${d.undid}${
    d.action === 'edit' ? `: ${what(d)}` : d.action === 'open' ? `, bringing back ${d.owner}'s shop` : `, closing ${d.shop} again`}${
    d.moved_back ? ` and reopening their shop at ${d.moved_back}` : ''}`,
};

// `kind` is one of SENTENCES' keys; `data` is described at the top.
// Empty lists and nulls are left out to keep the stored JSON small.
export function logRevision(req, kind, { revisionId, plotId, ...data }) {
  const kept = Object.fromEntries(Object.entries(data).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)));
  if (kept.tags && !kept.tags.added.length && !kept.tags.removed.length) delete kept.tags;
  let line = SENTENCES[kind](kept);
  if (kept.note) line += `. ${kind === 'reject' ? 'Reason' : 'Note'}: "${kept.note}"`;
  logModAction(req, `revision.${kind}`, `plot:${plotId}`, line, { revisionId, data: kept });
}
