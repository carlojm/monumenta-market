import { Suspense, use, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Undo2, X } from 'lucide-react';
import RevisionChanges from './RevisionChanges';
import { loadMyEdits } from '../lib/myActivity';
import { parseUtc, timeAgo } from '../lib/reports';

// Account page: every edit you've suggested or Force edited, newest first,
// with how it was reviewed and the reviewer's note. Withdrawn ones (including
// suggestions you replaced) fold away at the end. Mounted when its section
// first opens, so the first page starts loading then (useState's initializer,
// no effect); the Suspense boundary is inside, so this component never
// suspends and the request starts only once.
function YourEdits() {
  const [first] = useState(() => loadMyEdits());
  return (
    <Suspense fallback={<p className="account-note">Loading…</p>}>
      <EditList first={first} />
    </Suspense>
  );
}

function EditList({ first }) {
  const page = use(first);
  const [withdrawnCount, setWithdrawnCount] = useState(page.withdrawn ?? 0);
  if (page.error) return <p className="account-form__error" role="alert">{page.error}</p>;
  if (!page.edits.length && !withdrawnCount) {
    return <p className="account-note">No edits yet. Open a shop on the map and choose Edit.</p>;
  }
  return (
    <>
      <Pages page={page} onWithdrawn={() => setWithdrawnCount((n) => n + 1)} />
      {withdrawnCount > 0 && <WithdrawnFold count={withdrawnCount} />}
    </>
  );
}

// The withdrawn ones, loaded when first opened. Keyed by the count, so after
// you withdraw another one it loads again with it included.
function WithdrawnFold({ count }) {
  const [seen, setSeen] = useState(false);
  return (
    <details className="account-edits__withdrawn" onToggle={(e) => e.currentTarget.open && setSeen(true)}>
      <summary>Withdrawn ({count})</summary>
      {seen && <WithdrawnList key={count} />}
    </details>
  );
}

function WithdrawnList() {
  const [first] = useState(() => loadMyEdits({ withdrawn: true }));
  return (
    <Suspense fallback={<p className="account-note">Loading…</p>}>
      <LoadedWithdrawn first={first} />
    </Suspense>
  );
}

function LoadedWithdrawn({ first }) {
  const page = use(first);
  if (page.error) return <p className="account-form__error" role="alert">{page.error}</p>;
  return <Pages page={page} withdrawn />;
}

// One list with Load more. Kept in state so Withdraw and Load more can
// update it in place.
function Pages({ page, withdrawn = false, onWithdrawn }) {
  const [edits, setEdits] = useState(page.edits);
  const [hasMore, setHasMore] = useState(page.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadMore = async () => {
    setLoading(true);
    setError(null);
    const next = await loadMyEdits({ offset: edits.length, withdrawn });
    if (next.error) setError(next.error);
    else {
      setEdits([...edits, ...next.edits]);
      setHasMore(next.hasMore);
    }
    setLoading(false);
  };
  // Stays in place, marked Withdrawn, until the next visit.
  const markWithdrawn = (id) => {
    setEdits((list) => list.map((e) => (e.id === id ? { ...e, status: 'withdrawn' } : e)));
    onWithdrawn();
  };

  return (
    <>
      {edits.length > 0 && (
        <ul className="account-edits__list">
          {edits.map((e) => <EditItem key={e.id} edit={e} onWithdrawn={markWithdrawn} />)}
        </ul>
      )}
      {error && <p className="account-form__error" role="alert">{error}</p>}
      {hasMore && (
        <button type="button" className="account-edits__more" disabled={loading} onClick={loadMore}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}

// Which page, and for a new shop or a closure, what about it.
function title(e) {
  if (e.action === 'open') return `New shop by ${e.owner}`;
  if (e.action === 'vacate') return `${e.shop}: plot now empty`;
  return e.shop;
}

// Where the edit stands, and who reviewed it. The icon and color repeat the
// words, so neither is the only cue.
function status(e) {
  const by = e.reviewer ? ` by ${e.reviewer}` : '';
  switch (e.status) {
    case 'pending': return { tone: 'pending', Icon: Clock, text: 'Waiting for review' };
    case 'approved': return e.direct
      ? { tone: 'approved', Icon: Check, text: 'Force edit' }
      : { tone: 'approved', Icon: Check, text: `Approved${by}${e.adjusted.length ? ', with changes' : ''}` };
    case 'rejected': return { tone: 'rejected', Icon: X, text: `Rejected${by}` };
    default: return { tone: 'withdrawn', Icon: Undo2, text: 'Withdrawn' };
  }
}

function EditItem({ edit: e, onWithdrawn }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { tone, Icon, text } = status(e);
  const when = parseUtc(e.created_at);

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/revisions/${e.id}/withdraw`, { method: 'POST' });
    setBusy(false);
    if (res.ok) onWithdrawn(e.id);
    else setError((await res.json().catch(() => ({}))).error || 'Could not withdraw it. Please try again.');
  };

  return (
    <li className="account-edit">
      <div className="account-edit__head">
        <span className={`account-edit__status account-edit__status--${tone}`}>
          <Icon size={16} aria-hidden="true" />{text}
        </span>
        <time className="account-comment__muted" dateTime={when.toISOString()} title={when.toLocaleString()}>
          {timeAgo(e.created_at)}
        </time>
      </div>
      <Link to={`/plot/${e.plot_id}`} className="account-edit__shop">
        {title(e)} <span className="coord">{e.plot_id}</span>
      </Link>
      {e.moved_from && <p className="account-comment__muted">Moved from <span className="coord">{e.moved_from}</span></p>}
      {e.summary && <Note by="You" text={e.summary} />}
      {e.review_note && <Note by={e.reviewer ?? 'Reviewer'} text={e.review_note} />}
      {error && <p className="account-form__error" role="alert">{error}</p>}
      <RevisionChanges d={{ changes: e.changes, tags: e.tags, edited: e.adjusted }} fixedLabel="changed when approved" />
      {e.status === 'pending' && (
        <div className="account-edit__actions">
          <button type="button" disabled={busy} onClick={withdraw}>{busy ? 'Withdrawing…' : 'Withdraw'}</button>
        </div>
      )}
    </li>
  );
}

function Note({ by, text }) {
  return <p className="account-edit__note"><span className="account-comment__muted">{by}:</span> “{text}”</p>;
}

export default YourEdits;
