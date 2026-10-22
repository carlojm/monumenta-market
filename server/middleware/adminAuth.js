// server/middleware/adminAuth.js
//
// Staff checks for admin routes. Access comes from the logged-in account's
// role (see roleOf in lib/auth.js). ADMIN_TOKEN still works as an emergency
// key, e.g. from curl, if nobody can log in.

import crypto from 'node:crypto';
import { roleOf } from '../lib/auth.js';

// Constant-time comparison, so response timing can't leak the token.
function hasAdminToken(req) {
  const expected = process.env.ADMIN_TOKEN;
  const given = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!expected || !given) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireRole(allowed) {
  return (req, res, next) => {
    if (hasAdminToken(req)) return next();
    const role = roleOf(req.account);
    if (!role) return res.status(401).json({ error: 'Log in first.' });
    if (!allowed.includes(role)) return res.status(403).json({ error: "You don't have access to this." });
    next();
  };
}

export const requireModerator = requireRole(['moderator', 'admin']);
export const requireAdmin = requireRole(['admin']);
