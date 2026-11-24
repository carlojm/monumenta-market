import { Suspense, use, useRef, useState, useTransition } from 'react';
import RevisionChanges from '../components/RevisionChanges';
import { changedFields } from '../lib/shopFields';
import { dayLabel, loadLog } from '../lib/modLog';
import { parseUtc } from '../lib/reports';

const FILTERS = [['all', 'All'], ['edits', 'Page edits'], ['comments', 'Comments'], ['staff', 'Accounts and tags']];

// Staff: every staff action, comment and page revision, newest first, under
// day headings. A filter or search starts a new request right away (no
// effect): React keeps showing the current list until the new one is ready
// (useTransition), so the page doesn't jump while you type.
function AdminModLog() {
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState(() => ({ id: 0, kind: 'all', q: '', promise: loadLog() }));
  const [isPending, startTransition] = useTransition();
  const typing = useRef(null);
  const queries = useRef(0);

  // The request starts here, in the handler: React may run a state updater
  // more than once, so starting it inside setQuery(prev => …) would loop.
  const run = (next) => {
    clearTimeout(typing.current);
    queries.current += 1;
    const query = { id: queries.current, ...next, promise: loadLog(next) };
    startTransition(() => setQuery(query));
  };
  const choose = (k) => {
    setKind(k);
    run({ kind: k, q: q.trim() });
  };
  // Searches once you pause typing, or at once on Enter.
  const type = (e) => {
    const value = e.target.value;
    setQ(value);
    clearTimeout(typing.current);
    typing.current = setTimeout(() => run({ kind, q: value.trim() }), 300);
  };

  return (
    <div className="admin-modlog">
      <h2>Mod log</h2>
      <div className="admin-modlog__controls">
        <div className="admin-modlog__filters" role="group" aria-label="Show">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={kind === key} onClick={() => choose(key)}>{label}</button>
          ))}
        </div>
        <form role="search" onSubmit={(e) => { e.preventDefault(); run({ kind, q: q.trim() }); }}>
          <label className="visually-hidden" htmlFor="modlog-search">Search the mod log</label>
          <input id="modlog-search" type="search" value={q} onChange={type} placeholder="Plot, name or text" maxLength={100} />
        </form>
      </div>
      <div className={isPending ? 'admin-modlog__results admin-modlog__results--busy' : 'admin-modlog__results'} aria-busy={isPending}>
        <Suspense fallback={<p className="admin-modlog__muted">Loading…</p>}>
          {/* A new key per query, so "Load more" starts over. */}
          <LogPages key={query.id} query={query} />
        </Suspense>
      </div>
    </div>
  );
}

// The first page (from the query's promise) and any pages loaded after it.
function LogPages({ query }) {
  const first = use(query.promise);
  const [more, setMore] = useState([]);
  const [hasMore, setHasMore] = useState(first.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (first.error) return <p role="alert">{first.error}</p>;
  const entries = [...first.entries, ...more];
  if (!entries.length) {
    return <p className="admin-modlog__muted" role="status">{query.q || query.kind !== 'all' ? 'Nothing matches.' : 'Nothing logged yet.'}</p>;
  }

  const loadMore = async () => {
    setLoading(true);
    setError(null);
    const data = await loadLog({ kind: query.kind, q: query.q, offset: entries.length });
    if (data.error) setError(data.error);
    else {
      setMore([...more, ...data.entries]);
      setHasMore(data.hasMore);
    }
    setLoading(false);
  };

  // Consecutive entries from the same day share a heading.
  const days = [];
  for (const e of entries) {
    const day = dayLabel(e.created_at);
    if (days.at(-1)?.day === day) days.at(-1).entries.push(e);
    else days.push({ day, entries: [e] });
  }

  return (
    <>
      {days.map(({ day, entries: list }) => (
        <section key={day} className="admin-modlog__day" aria-label={day}>
          <h3>{day}</h3>
          <ul>
            {list.map((e) => <LogEntry key={e.id} entry={e} />)}
          </ul>
        </section>
      ))}
      {error && <p role="alert">{error}</p>}
      {hasMore && (
        <button type="button" className="admin-modlog__more" disabled={loading} onClick={loadMore}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}

// --- One entry ---

// What a page revision entry did, after the person's name.
function verb(kind, d) {
  const author = d.author ?? 'a deleted account';
  switch (kind) {
    case 'suggest': return 'suggested';
    case 'publish': return 'Force edited';
    case 'withdraw': return 'withdrew a suggestion';
    case 'approve': return `approved ${author}'s suggestion${d.edited ? ', with changes' : ''}`;
    case 'reject': return `rejected ${author}'s suggestion`;
    case 'undo': return `undid Force edit #${d.undid}`;
    default: return null;
  }
}


// Which shop and what about it.
function subject(kind, d) {
  const reopened = d.moved_back ? `, and their shop at ${d.moved_back} reopened` : '';
  if (kind === 'undo' && d.action === 'open') return `Brought back ${d.owner}'s shop${reopened}`;
  if (kind === 'undo' && d.action === 'vacate') return `${d.shop} closed again${reopened}`;
  if (d.action === 'open') {
    return `New shop by ${d.owner}${d.shop ? `, replacing ${d.shop}` : ''}${d.moved_from ? `, moved from ${d.moved_from}` : ''}`;
  }
  if (d.action === 'vacate') return `${d.shop} closed, the plot is now empty`;
  return `${d.shop}: ${changedFields(d) ?? 'nothing left to change'}`;
}

function LogEntry({ entry: e }) {
  const kind = e.action.startsWith('revision.') && e.data ? e.action.slice('revision.'.length) : null;
  const d = e.data ?? {};
  const actor = e.actor ?? 'Admin token';
  const [targetKind, targetId] = (e.target ?? '').split(':');
  const when = parseUtc(e.created_at);
  // The author's note: on a review it's the suggester's, otherwise it's theirs.
  const summaryBy = kind === 'approve' || kind === 'reject' ? d.author ?? 'A deleted account' : actor;

  return (
    <li className="modlog-entry">
      <div className="modlog-entry__head">
        <span>
          <strong>{actor}</strong>
          {!!e.actor_deleted && <span className="admin-modlog__muted"> (deleted account)</span>}
          {kind && ` ${verb(kind, d)}`}
        </span>
        <time className="admin-modlog__muted" dateTime={when.toISOString()} title={when.toLocaleString()}>
          {when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </time>
      </div>
      <p className="modlog-entry__what">{kind ? subject(kind, d) : e.details}</p>
      {(targetKind === 'plot' || e.revision_id) && (
        <div className="modlog-entry__where">
          {targetKind === 'plot' && (
            <a href={`/plot/${targetId}`} target="_blank" rel="noreferrer"><span className="coord">{targetId}</span></a>
          )}
          {e.revision_id && <span className="admin-modlog__muted">#{e.revision_id}</span>}
        </div>
      )}
      {d.summary && <Note by={summaryBy} text={d.summary} />}
      {d.note && <Note by={actor} text={d.note} />}
      {d.replaced && <p className="admin-modlog__muted">Replaced their earlier suggestion</p>}
      {kind && <RevisionChanges kind={kind} d={d} />}
    </li>
  );
}

function Note({ by, text }) {
  return <p className="modlog-entry__note"><span className="admin-modlog__muted">{by}:</span> “{text}”</p>;
}

export default AdminModLog;
