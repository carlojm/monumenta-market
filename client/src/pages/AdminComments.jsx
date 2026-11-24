import { useRef, useState } from 'react';
import { adminFetch } from '../lib/adminAuth';
import { formatDate, timeAgo } from '../lib/reports';
import { displayName } from '../lib/plots';
import { createResource, useResource } from '../lib/resource';

const fetchComments = (q, offset) => adminFetch(`/api/admin/comments?q=${encodeURIComponent(q)}&offset=${offset}`)
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Could not load comments. Is your admin token still valid?'))));

// The first page for the current search (lib/resource.js: loads when the page
// opens, and again for each search). Load more and deletes update it in place.
let search = '';
const resultsResource = createResource(() => fetchComments(search, 0));

// Every player comment, newest first, searchable, with delete. Comments go
// live immediately, so moderation happens here after the fact.
function AdminComments() {
  const { data, error: loadError } = useResource(resultsResource);
  const comments = data?.comments ?? [];
  const [query, setQuery] = useState(search);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [error, setError] = useState(null);
  const typing = useRef(null);

  // Search as you type, after a short pause.
  const type = (e) => {
    setQuery(e.target.value);
    clearTimeout(typing.current);
    const q = e.target.value.trim();
    typing.current = setTimeout(() => {
      search = q;
      resultsResource.refresh();
    }, 300);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    setError(null);
    try {
      const next = await fetchComments(search, comments.length);
      resultsResource.set({ comments: [...comments, ...next.comments], hasMore: next.hasMore });
    } catch (err) {
      setError(err.message);
    }
    setLoadingMore(false);
  };

  const remove = async (id) => {
    const res = await adminFetch(`/api/admin/comments/${id}`, { method: 'DELETE' });
    if (!res.ok) return setError('Could not delete that comment.');
    resultsResource.set({ ...data, comments: comments.filter((c) => c.id !== id) });
    setConfirmingId(null);
  };

  return (
    <div className="admin-comments">
      <input
        type="text"
        placeholder="Search comment text, author, plot (lime-3) or shop…"
        value={query}
        onChange={type}
      />
      {(error || loadError) && <p className="admin-comments__error">{error || loadError}</p>}
      {data && comments.length === 0 && <p>No comments found.</p>}

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

      {data?.hasMore && (
        <button type="button" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

export default AdminComments;
