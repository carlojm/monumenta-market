import { useRef, useState } from 'react';
import { adminFetch } from '../lib/adminAuth';
import { formatDate } from '../lib/reports';
import { createResource, useResource } from '../lib/resource';

const ROLE_LABELS = { player: 'Player', moderator: 'Moderator', admin: 'Admin' };

// Admin only: look up accounts, make or remove moderators, and ban or unban. Admins
// themselves are set in ADMIN_UUIDS in the server's .env.
const fetchAccounts = (q, offset) => adminFetch(`/api/admin/accounts?q=${encodeURIComponent(q)}&offset=${offset}`)
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Could not load accounts.'))));

// The first page for the current search (lib/resource.js: loads when the page
// opens, and again for each search). Load more and changes update it in place.
let search = '';
const resultsResource = createResource(() => fetchAccounts(search, 0));

function AdminAccounts() {
  const { data, error: loadError } = useResource(resultsResource);
  const accounts = data?.accounts ?? [];
  const setAccounts = (update) => resultsResource.set({ ...data, accounts: update(accounts) });
  const [query, setQuery] = useState(search);
  const [loadingMore, setLoadingMore] = useState(false);
  const typing = useRef(null);
  const [busyId, setBusyId] = useState(null);
  const [banningId, setBanningId] = useState(null); // row with the ban form open
  const [banReason, setBanReason] = useState('');
  const [banDeleteComments, setBanDeleteComments] = useState(false);
  const [error, setError] = useState(null);

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
      const next = await fetchAccounts(search, accounts.length);
      resultsResource.set({ accounts: [...accounts, ...next.accounts], hasMore: next.hasMore });
    } catch (err) {
      setError(err.message);
    }
    setLoadingMore(false);
  };

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

  // Ban (PUT) or unban (DELETE); the server returns the updated account.
  const sendBan = async (account, ban) => {
    setBusyId(account.id);
    setError(null);
    const res = await adminFetch(`/api/admin/accounts/${account.id}/ban`, ban
      ? {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: banReason, delete_comments: banDeleteComments }),
        }
      : { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) return setError(data.error || 'Could not change the ban.');
    setAccounts((prev) => prev.map((a) => (a.id === data.id ? data : a)));
    setBanningId(null);
  };

  const openBanForm = (account) => {
    setBanningId(account.id);
    setBanReason('');
    setBanDeleteComments(false);
  };

  return (
    <div className="admin-accounts">
      <input
        type="text"
        placeholder="Search by Minecraft name or UUID…"
        value={query}
        onChange={type}
      />
      {(error || loadError) && <p className="admin-comments__error">{error || loadError}</p>}
      {data && accounts.length === 0 && <p>No accounts found.</p>}

      <ul>
        {accounts.map((a) => (
          <li key={a.id}>
            <div className="admin-accounts__who">
              <strong>{a.name}</strong>
              <span className={`admin-accounts__role admin-accounts__role--${a.role}`}>{ROLE_LABELS[a.role]}</span>
              {a.banned_at && <span className="admin-accounts__role admin-accounts__role--banned">Banned</span>}
              <span className="coord admin-accounts__uuid">{a.uuid}</span>
              <span className="admin-comments__muted">
                linked {formatDate(a.created_at)}, {a.comment_count} comment{a.comment_count === 1 ? '' : 's'}
              </span>
              {a.banned_at && (
                <span className="admin-comments__muted">
                  banned {formatDate(a.banned_at)}{a.ban_reason ? `: ${a.ban_reason}` : ''}
                </span>
              )}
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
              {a.role !== 'admin' && (a.banned_at ? (
                <button type="button" disabled={busyId === a.id} onClick={() => sendBan(a, false)}>Unban</button>
              ) : banningId !== a.id && (
                <button type="button" className="admin-accounts__ban" onClick={() => openBanForm(a)}>Ban…</button>
              ))}
            </div>
            {banningId === a.id && (
              <form className="admin-accounts__ban-form" onSubmit={(e) => { e.preventDefault(); sendBan(a, true); }}>
                <span>Ban <strong>{a.name}</strong>? They'll be logged out and can't log in or relink.</span>
                <input type="text" placeholder="Reason (only admins see this)" value={banReason}
                  onChange={(e) => setBanReason(e.target.value)} />
                <label>
                  <input type="checkbox" checked={banDeleteComments}
                    onChange={(e) => setBanDeleteComments(e.target.checked)} />
                  Also delete all their comments ({a.comment_count})
                </label>
                <div className="admin-accounts__ban-actions">
                  <button type="submit" className="admin-accounts__ban" disabled={busyId === a.id}>Ban</button>
                  <button type="button" onClick={() => setBanningId(null)}>Cancel</button>
                </div>
              </form>
            )}
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

export default AdminAccounts;
