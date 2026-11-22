import { useState } from 'react';
import DiffText from './DiffText';
import { FIELDS, OWNER, labelOf } from '../lib/shopFields';
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

// Suggestions waiting for review, on the card. Anyone can see them, like a
// wiki's pending changes, so nobody suggests the same thing twice. Collapsed
// to one line until "Show". Your own can be withdrawn here.
function PendingEdits({ edits, catalog, shopTags, onWithdraw }) {
  const [open, setOpen] = useState(false);
  if (!edits.length) return null;
  const tagName = (id) => catalog?.tags.find((t) => t.id === id)?.name ?? shopTags.find((t) => t.id === id)?.name ?? `#${id}`;
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
              <div className="pending-edits__head">
                <strong>{TITLES[e.action]}</strong>{' '}
                <span className="pending-edits__muted">
                  by {e.mine ? 'you' : e.author ?? 'a deleted account'} {timeAgo(e.created_at)}
                </span>
              </div>
              {e.summary && <p className="pending-edits__summary">“{e.summary}”</p>}
              <PendingChanges edit={e} tagName={tagName} />
              {e.mine && (
                <div className="pending-edits__actions">
                  <button type="button" onClick={() => onWithdraw(e.id)}>Withdraw</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default PendingEdits;
