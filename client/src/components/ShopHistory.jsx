import { Suspense, use, useState } from 'react';
import RevisionChanges from './RevisionChanges';
import { loadHistory } from '../lib/history';
import { SHOP_FIELDS, changedFields, maintainersOf } from '../lib/shopFields';
import { formatDate, parseUtc, timeAgo } from '../lib/reports';
import './ShopHistory.css';

// The card's History tab (3.9): every saved change to this plot's page,
// newest first, then the older Update lines. Mounted when the tab is first
// opened, so it loads then (useState's initializer, no effect); the card
// gives it a new key after an edit, so it loads again.
// With `account` and the current `shop`, older versions can be restored;
// `onRestored(result)` gets the server's answer, like the edit form's onDone.
function ShopHistory({ plotId, shop = null, account = null, onRestored }) {
  const [first] = useState(() => loadHistory(plotId));
  return (
    <Suspense fallback={<p className="plot-detail__empty">Loading…</p>}>
      <HistoryPages plotId={plotId} first={first} restore={account && shop ? { plotId, shop, account, onRestored } : null} />
    </Suspense>
  );
}

function HistoryPages({ plotId, first, restore }) {
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
          {changes.map((c) => <Change key={c.id} change={c} restore={restore} />)}
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

function Change({ change: c, restore }) {
  const summary = c.summary && !UNDO.test(c.summary) ? c.summary : null;
  const current = restore && snapshotOf(restore.shop);
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
      {current && c.version && !sameVersion(c.version, current) && (
        <Restore change={c} current={current} {...restore} />
      )}
    </li>
  );
}

// Defined once, so React calls it only when the button first appears (an
// inline arrow would run again on every render and pull focus back).
const focusOnMount = (el) => { el?.focus(); };

// The current page as a revision snapshot (what an edit is based on).
function snapshotOf(shop) {
  return { ...Object.fromEntries(SHOP_FIELDS.map((f) => [f, shop[f] ?? null])), tag_ids: (shop.tags ?? []).map((t) => t.id) };
}
const sorted = (ids) => [...ids].sort((a, b) => a - b).join();
const sameVersion = (a, b) => SHOP_FIELDS.every((f) => (a[f] ?? null) === (b[f] ?? null)) && sorted(a.tag_ids) === sorted(b.tag_ids);

// "Restore this version": sent as a normal edit (the current page as base,
// that version proposed), so the usual rules decide who publishes and who
// suggests. The label says which, the same way the server decides
// (canPublish in lib/revisions.js): staff, the owner, or a maintainer unless
// it changes the maintainers.
function Restore({ change: c, current, plotId, shop, account, onRestored }) {
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const me = account.name.toLowerCase();
  const staff = account.role === 'moderator' || account.role === 'admin';
  const owner = me === shop.owner.toLowerCase();
  const maintainer = maintainersOf(shop).some((n) => n.toLowerCase() === me);
  const publishes = staff || owner || (maintainer && (c.version.maintainers ?? null) === (current.maintainers ?? null));

  const send = async () => {
    setSending(true);
    setError(null);
    const res = await fetch(`/api/plots/${plotId}/revisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'edit', base: current, proposed: { ...c.version, owner: shop.owner },
        summary: `Restored the version from ${formatDate(c.saved_at)}`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) return setError(data.error || 'Could not restore it. Please try again.');
    setAsking(false);
    onRestored?.(data);
  };

  if (!asking) {
    return (
      <div className="shop-history__actions">
        <button type="button" onClick={() => setAsking(true)}>
          {publishes ? 'Restore this version' : 'Suggest restoring this version'}
        </button>
      </div>
    );
  }
  return (
    <div className="shop-history__confirm">
      <p>
        {publishes
          ? 'The page goes back to how it was after this change.'
          : 'The owner or a moderator reviews it before it shows.'}
      </p>
      {error && <p className="plot-detail__error" role="alert">{error}</p>}
      <div className="shop-history__actions">
        <button type="button" disabled={sending} onClick={send}>
          {sending ? 'Sending…' : publishes ? 'Restore' : 'Suggest'}
        </button>
        {/* Focus on the safe choice, as in the card's other confirmations. */}
        <button type="button" ref={focusOnMount} onClick={() => setAsking(false)}>Cancel</button>
      </div>
    </div>
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
