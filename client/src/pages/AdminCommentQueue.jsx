import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminAuth';

function AdminCommentQueue() {
  const [pending, setPending] = useState([]);

  const load = () => {
    adminFetch('/api/admin/comments/pending')
      .then((res) => res.json())
      .then(setPending);
  };

  useEffect(load, []);

  const approve = async (id) => {
    await adminFetch(`/api/admin/comments/${id}/approve`, { method: 'POST' });
    setPending((prev) => prev.filter((c) => c.id !== id));
  };

  const reject = async (id) => {
    await adminFetch(`/api/admin/comments/${id}/reject`, { method: 'POST' });
    setPending((prev) => prev.filter((c) => c.id !== id));
  };

  if (pending.length === 0) return <p>No comments waiting for approval.</p>;

  return (
    <ul className="admin-queue">
      {pending.map((c) => (
        <li key={c.id}>
          <p className="admin-queue__meta">
            <span className="coord">{c.plot_id}</span> ({c.owner}) — {c.author || 'Anonymous'}
          </p>
          <p>{c.body}</p>
          <button onClick={() => approve(c.id)}>Approve</button>
          <button onClick={() => reject(c.id)}>Reject</button>
        </li>
      ))}
    </ul>
  );
}

export default AdminCommentQueue;