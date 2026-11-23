import { useState } from 'react';
import DiffText from './DiffText';
import ReviewActions from './ReviewActions';
import { FIELDS, OWNER, labelOf, tagNamer } from '../lib/shopFields';
import { timeAgo } from '../lib/reports';
import './PendingEdits.css';

const TITLES = { edit: 'Edit', open: 'A new shop is here', vacate: 'The plot is now empty' };

// What one suggestion would change. For an edit, the server has already
// worked out what approving it now would do (`changes`, `tags`, `conflicts`).
function PendingChanges({ edit, tagName }) {
  if (edit.stale) return <p className="pending-edits__muted">Made for an earlier shop on this plot.</p>;
  if (edit.action === 'vacate') return null;
  if (edit.action === 'open') {
    const filled = [OWNER, ...FIELDS].filter((f) => edit.proposed[f.key]);
    return (
      <>
        {/* One shop per owner: approving moves them, closing their other shop. */}
        {edit.moves_from && (
          <p className="pending-edits__warning">
            {edit.proposed.owner}'s shop at <span className="coord">{edit.moves_from}</span> closes when this is approved.
          </p>
        )}
        {filled.map((f) => (
          <div className="pending-edits__field" key={f.key}>
            <span className="pending-edits__label">{f.label}</span>
            <DiffText before="" after={edit.proposed[f.key]} />
          </div>
        ))}
        {edit.proposed.tag_ids.length > 0 && (
          <div className="pending-edits__field">
            <span className="pending-edits__label">Tags</span>
            <p className="diff-text"><ins>{edit.proposed.tag_ids.map(tagName).join(', ')}</ins></p>
          </div>
        )}
      </>
    );
  }
  const { changes, tags, conflicts } = edit;
  if (!changes.length && !tags.added.length && !tags.removed.length && !conflicts.length) {
    return <p className="pending-edits__muted">Nothing left to change: the page already has this.</p>;
  }
  return (
    <>
      {changes.map((c) => (
        <div className="pending-edits__field" key={c.field}>
          <span className="pending-edits__label">{labelOf(c.field)}</span>
          <DiffText before={c.from} after={c.to} />
        </div>
      ))}
      {(tags.added.length > 0 || tags.removed.length > 0) && (
        <div className="pending-edits__field">
          <span className="pending-edits__label">Tags</span>
          {tags.added.length > 0 && <p className="diff-text">Added <ins>{tags.added.map(tagName).join(', ')}</ins></p>}
          {tags.removed.length > 0 && <p className="diff-text">Removed <del>{tags.removed.map(tagName).join(', ')}</del></p>}
        </div>
      )}
      {/* Someone else changed the same field since; shown against the page as it is now. */}
      {conflicts.map((c) => (
        <div className="pending-edits__field" key={c.field}>
          <span className="pending-edits__label">
            {labelOf(c.field)} <span className="pending-edits__muted">changed since this was suggested</span>
          </span>
          <DiffText before={c.theirs} after={c.mine} />
        </div>
      ))}
    </>
  );
}

// One suggestion: what it is, who sent it and when, their note, and its
// changes. `children` go at the end (Withdraw, Approve/Reject, a plot link).
export function PendingEditItem({ edit: e, tagName, children }) {
  return (
    <>
      <div className="pending-edits__head">
        <strong>{TITLES[e.action]}</strong>{' '}
        <span className="pending-edits__muted">
          by {e.mine ? 'you' : e.author ?? 'a deleted account'} {timeAgo(e.created_at)}
        </span>
      </div>
      {e.summary && <p className="pending-edits__summary">“{e.summary}”</p>}
      <PendingChanges edit={e} tagName={tagName} />
      {children}
    </>
  );
}

// Suggestions waiting for review, on the card. Anyone can see them, like a
// wiki's pending changes, so nobody suggests the same thing twice. Collapsed
// to one line until "Show". Your own can be withdrawn here; the shop's owner
// and moderators can approve or reject (`can_review`).
function PendingEdits({ edits, catalog, shopTags, onWithdraw, onReviewed }) {
  const [open, setOpen] = useState(false);
  if (!edits.length) return null;
  const tagName = tagNamer(catalog, shopTags);
  const mine = edits.some((e) => e.mine);
  const count = edits.length === 1 ? '1 edit' : `${edits.length} edits`;
  const line = edits.length === 1 && mine
    ? 'Your edit is waiting for review'
    : `${count} waiting for review${mine ? ', including yours' : ''}`;

  return (
    <section className="pending-edits" aria-label="Edits waiting for review">
      <div className="pending-edits__bar">
        <span>{line}</span>
        <button type="button" aria-expanded={open} aria-controls="pending-edits-list" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <ul className="pending-edits__list" id="pending-edits-list">
          {edits.map((e) => (
            <li key={e.id}>
              <PendingEditItem edit={e} tagName={tagName}>
                {e.can_review && <ReviewActions edit={e} onReviewed={onReviewed} />}
                {e.mine && (
                  <div className="pending-edits__actions">
                    <button type="button" onClick={() => onWithdraw(e.id)}>Withdraw</button>
                  </div>
                )}
              </PendingEditItem>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default PendingEdits;
