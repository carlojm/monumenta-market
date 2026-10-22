// server/routes/admin.js
//
// Admin-only account management, mounted at /api/admin.
//   GET /accounts?q=&offset=     newest first, 50 per page; q matches name or UUID
//   PUT /accounts/:id/role {role} 'player' | 'moderator' (admins come from .env)

import express from 'express';
import db from '../db/init.js';
import { roleOf } from '../lib/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';

// requireAdmin goes on each route, not router.use(): this router is mounted at
// /api/admin, which also has moderator routes (comments, images) in index.js.
const router = express.Router();

const PAGE = 50;
// Only these columns ever leave the server (never password_hash).
const ACCOUNT_COLUMNS = `
  a.id, a.uuid, a.name, a.role, a.created_at,
  (SELECT COUNT(*) FROM comments c WHERE c.account_id = a.id) AS comment_count
`;
const searchAccounts = db.prepare(`
  SELECT ${ACCOUNT_COLUMNS}
  FROM accounts a
  WHERE @q = '' OR a.name LIKE @like OR a.uuid LIKE @like
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT @limit OFFSET @offset
`);

// The role shown is the effective one, so admins from .env show as 'admin'.
const withRole = (a) => ({ ...a, role: roleOf(a) });

router.get('/accounts', requireAdmin, (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  const rows = searchAccounts.all({ q, like: `%${q}%`, limit: PAGE + 1, offset });
  res.json({ accounts: rows.slice(0, PAGE).map(withRole), hasMore: rows.length > PAGE });
});

const ASSIGNABLE_ROLES = ['player', 'moderator'];
const getAccount = db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts a WHERE a.id = ?`);

router.put('/accounts/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${ASSIGNABLE_ROLES.join(', ')}` });
  }
  const account = getAccount.get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (roleOf(account) === 'admin') {
    return res.status(400).json({ error: 'Admins are set in ADMIN_UUIDS in .env, not here.' });
  }

  db.prepare('UPDATE accounts SET role = ? WHERE id = ?').run(role, account.id);
  res.json(withRole(getAccount.get(account.id)));
});

export default router;
