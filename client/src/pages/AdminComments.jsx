import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminAuth';
import { formatDate, timeAgo } from '../lib/reports';
import { displayName } from '../lib/plots';

// Every player comment, newest first, searchable, with delete. Comments go
// live immediately, so moderation happens here after the fact.
function AdminComments() {
  const [query, setQuery] = useState('');
  const [comments, setComments] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState(null);
  const [error, setError] = useState(null);

  const load = async (q, offset) => {
    setLoading(true);
    setError(null);
    const res = await adminFetch(`/api/admin/comments?q=${encodeURIComponent(q)}&offset=${offset}`);
    if (!res.ok) {
      setLoading(false);
      return setError('Could not load comments. Is your admin token still valid?');
    }
    const data = await res.json();
    setComments((prev) => (offset === 0 ? data.comments : [...prev, ...data.comments]));
    setHasMore(data.hasMore);
    setLoading(false);
  };

  // Search as you type, after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => load(query.trim(), 0), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const remove = async (id) => {
    const res = await adminFetch(`/api/admin/comments/${id}`, { method: 'DELETE' });
    if (!res.ok) return setError('Could not delete that comment.');
    setComments((prev) => prev.filter((c) => c.id !== id));
    setConfirmingId(null);
  };

  return (
    <div className="admin-comments">
      <input
        type="text"
        placeholder="Search comment text, author, plot (lime-3) or shop…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="admin-comments__error">{error}</p>}
      {!loading && comments.length === 0 && <p>No comments found.</p>}

      <ul>
        {comments.map((c) => (
          <li key={c.id}>
            <div className="admin-comments__meta">
              <strong>{c.author || 'Anonymous'}</strong>
              <span className="admin-comments__muted">{c.verified ? 'linked account' : 'typed name'}</span>
              <a href={`/plot/${c.plot_id}`} target="_blank" rel="noreferrer">
                <span className="coord">{c.plot_id}</span> {displayName(c)}
              </a>
              {c.shop_closed_at && <span className="admin-comments__muted">shop closed</span>}
            </div>
            <p>{c.body}</p>
            <div className="admin-comments__footer">
              <span className="admin-comments__muted">{formatDate(c.created_at)}</span>
              {c.accuracy && (
                <span>
                  {c.accuracy === 'outdated' ? 'Outdated' : 'Accurate'}{' '}
                  <span className="admin-comments__muted">{timeAgo(c.accuracy_at)}</span>
                </span>
              )}
              {confirmingId === c.id ? (
                <span className="admin-comments__confirm">
                  Delete this comment?
                  <button type="button" onClick={() => remove(c.id)}>Yes</button>
                  <button type="button" onClick={() => setConfirmingId(null)}>Cancel</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmingId(c.id)}>Delete</button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button type="button" disabled={loading} onClick={() => load(query.trim(), comments.length)}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

export default AdminComments;
