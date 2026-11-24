import { Suspense, use, useState } from 'react';
import RevisionChanges from './RevisionChanges';
import { loadHistory } from '../lib/history';
import { changedFields } from '../lib/shopFields';
import { parseUtc, timeAgo } from '../lib/reports';
import './ShopHistory.css';

// The card's History tab (3.9): every saved change to this plot's page,
// newest first, then the older Update lines. Mounted when the tab is first
// opened, so it loads then (useState's initializer, no effect); the card
// gives it a new key after an edit, so it loads again.
function ShopHistory({ plotId }) {
  const [first] = useState(() => loadHistory(plotId));
  return (
    <Suspense fallback={<p className="plot-detail__empty">Loading…</p>}>
      <HistoryPages plotId={plotId} first={first} />
    </Suspense>
  );
}

function HistoryPages({ plotId, first }) {
  const page = use(first);
  const [changes, setChanges] = useState(page.changes ?? []);
  const [earlier, setEarlier] = useState(page.earlier ?? []);
  const [hasMore, setHasMore] = useState(page.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (page.error) return <p className="plot-detail__error" role="alert">{page.error}</p>;
  if (!changes.length && !earlier.length) return <p className="plot-detail__empty">No changes yet</p>;

  const loadMore = async () => {
    setLoading(true);
    setError(null);
    const next = await loadHistory(plotId, changes.length);
    if (next.error) setError(next.error);
    else {
      setChanges([...changes, ...next.changes]);
      setEarlier(next.earlier ?? []);
      setHasMore(next.hasMore);
    }
    setLoading(false);
  };

  return (
    <>
      {changes.length > 0 && (
        <ul className="shop-history">
          {changes.map((c) => <Change key={c.id} change={c} />)}
        </ul>
      )}
      {error && <p className="plot-detail__error" role="alert">{error}</p>}
      {hasMore && (
        <button type="button" className="shop-history__more" disabled={loading} onClick={loadMore}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
      {!hasMore && earlier.length > 0 && (
        <>
          <h4 className="shop-history__earlier">Earlier changes</h4>
          <ul className="shop-history">
            {earlier.map((e) => (
              <li key={e.id} className="shop-history__item">
                <div className="shop-history__head">
                  <span>{e.body}</span>
                  <When at={e.created_at} />
                </div>
                {e.author && <p className="plot-detail__muted">by {e.author}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// An undo is saved as the change it makes, with this summary (server).
const UNDO = /^Undo of #\d+$/;

// "Tester edited Keywords" and the like, after the name.
function what(c) {
  if (c.summary && UNDO.test(c.summary)) return 'undid a change';
  if (c.action === 'open') return `opened a new shop for ${c.owner}${c.moved_from ? `, moved from ${c.moved_from}` : ''}`;
  if (c.action === 'vacate') return `closed ${c.shop ?? 'the shop'}`;
  const fields = changedFields(c);
  return fields ? `edited ${fields}` : 'saved an edit';
}

function Change({ change: c }) {
  const summary = c.summary && !UNDO.test(c.summary) ? c.summary : null;
  return (
    <li className="shop-history__item">
      <div className="shop-history__head">
        <span>
          <strong>{c.author ?? 'A deleted account'}</strong> {what(c)}
          {c.reviewer && <span className="plot-detail__muted">, approved by {c.reviewer}</span>}
        </span>
        <When at={c.saved_at} />
      </div>
      {summary && <p className="shop-history__note">“{summary}”</p>}
      {c.note && <p className="shop-history__note"><span className="plot-detail__muted">{c.reviewer ?? 'Reviewer'}:</span> “{c.note}”</p>}
      {c.action === 'edit' && <RevisionChanges kind="publish" d={c} />}
    </li>
  );
}

function When({ at }) {
  const date = parseUtc(at);
  return (
    <time className="plot-detail__muted" dateTime={date.toISOString()} title={date.toLocaleString()}>
      {timeAgo(at)}
    </time>
  );
}

export default ShopHistory;
