import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminAuth';
import { formatDate } from '../lib/reports';

const ROLE_LABELS = { player: 'Player', moderator: 'Moderator', admin: 'Admin' };

// Admin only: look up accounts and make or remove moderators. Admins
// themselves are set in ADMIN_UUIDS in the server's .env.
function AdminAccounts() {
  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = async (q, offset) => {
    setLoading(true);
    setError(null);
    const res = await adminFetch(`/api/admin/accounts?q=${encodeURIComponent(q)}&offset=${offset}`);
    if (!res.ok) {
      setLoading(false);
      return setError('Could not load accounts.');
    }
    const data = await res.json();
    setAccounts((prev) => (offset === 0 ? data.accounts : [...prev, ...data.accounts]));
    setHasMore(data.hasMore);
    setLoading(false);
  };

  // Search as you type, after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => load(query.trim(), 0), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const setRole = async (account, role) => {
    setBusyId(account.id);
    setError(null);
    const res = await adminFetch(`/api/admin/accounts/${account.id}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) return setError(data.error || 'Could not change the role.');
    setAccounts((prev) => prev.map((a) => (a.id === data.id ? data : a)));
  };

  return (
    <div className="admin-accounts">
      <input
        type="text"
        placeholder="Search by Minecraft name or UUID…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="admin-comments__error">{error}</p>}
      {!loading && accounts.length === 0 && <p>No accounts found.</p>}

      <ul>
        {accounts.map((a) => (
          <li key={a.id}>
            <div className="admin-accounts__who">
              <strong>{a.name}</strong>
              <span className={`admin-accounts__role admin-accounts__role--${a.role}`}>{ROLE_LABELS[a.role]}</span>
              <span className="coord admin-accounts__uuid">{a.uuid}</span>
              <span className="admin-comments__muted">
                linked {formatDate(a.created_at)}, {a.comment_count} comment{a.comment_count === 1 ? '' : 's'}
              </span>
            </div>
            <div className="admin-accounts__actions">
              {a.role === 'admin' ? (
                <span className="admin-comments__muted">Set in .env</span>
              ) : a.role === 'moderator' ? (
                <button type="button" disabled={busyId === a.id} onClick={() => setRole(a, 'player')}>
                  Remove moderator
                </button>
              ) : (
                <button type="button" disabled={busyId === a.id} onClick={() => setRole(a, 'moderator')}>
                  Make moderator
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button type="button" disabled={loading} onClick={() => load(query.trim(), accounts.length)}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

export default AdminAccounts;
