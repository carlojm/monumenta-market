import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminAuth';
import { formatDate, timeAgo } from '../lib/reports';

// Admin only: every staff action plus all comment activity (new comments and
// deletions), newest first.
function AdminModLog() {
  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getPage = (offset) =>
    adminFetch(`/api/admin/modlog?offset=${offset}`).then((res) => {
      if (!res.ok) throw new Error('Could not load the mod log.');
      return res.json();
    });

  // First page. State is only set once the response arrives.
  useEffect(() => {
    getPage(0)
      .then((data) => {
        setEntries(data.entries);
        setHasMore(data.hasMore);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = async () => {
    setLoading(true);
    try {
      const data = await getPage(entries.length);
      setEntries((prev) => [...prev, ...data.entries]);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // "plot:lime-3" links to that plot's card.
  const targetLink = (target) => {
    const [kind, id] = (target ?? '').split(':');
    if (kind !== 'plot') return null;
    return (
      <a href={`/plot/${id}`} target="_blank" rel="noreferrer">
        <span className="coord">{id}</span>
      </a>
    );
  };

  return (
    <div className="admin-modlog">
      {error && <p className="admin-comments__error">{error}</p>}
      {!loading && entries.length === 0 && <p>No staff actions yet.</p>}
      <ul>
        {entries.map((e) => (
          <li key={e.id}>
            <div className="admin-comments__meta">
              <strong>{e.actor ?? 'Admin token'}</strong>
              {!!e.actor_deleted && <span className="admin-comments__muted">deleted account</span>}
              {targetLink(e.target)}
              <span className="admin-comments__muted" title={formatDate(e.created_at)}>{timeAgo(e.created_at)}</span>
            </div>
            <p>{e.details}</p>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button type="button" disabled={loading} onClick={loadMore}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

export default AdminModLog;
