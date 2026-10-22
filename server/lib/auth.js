// server/lib/auth.js
//
// Passwords, sessions and the login cookie. Accounts are created by claiming
// a code from the verify server (see routes/auth.js).

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import db from '../db/init.js';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200; // scrypt is slow on purpose, so cap the input size

const SESSION_COOKIE = 'session';
const SESSION_DAYS = 90;

// --- Passwords: scrypt with a random salt. Stored as "scrypt$salt$hash". ---

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function checkPassword(password, stored) {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected); // constant-time compare
}

// Returns an error message, or null if the password is acceptable.
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  }
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters.`;
  return null;
}

// --- Sessions: the browser keeps a random token; we store only its hash. ---

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const insertSession = db.prepare(`
  INSERT INTO sessions (token_hash, account_id, expires_at)
  VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))
`);
const deleteExpiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP');
const findSessionAccount = db.prepare(`
  SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
  WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
`);
const extendSession = db.prepare(
  `UPDATE sessions SET expires_at = datetime('now', '+${SESSION_DAYS} days') WHERE token_hash = ?`
);
const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
const deleteAccountSessions = db.prepare('DELETE FROM sessions WHERE account_id = ?');

const cookieOptions = {
  httpOnly: true, // page JavaScript can't read it
  sameSite: 'lax', // other sites can't make the browser send it with their requests
  secure: process.env.NODE_ENV === 'production', // HTTPS only (localhost dev is plain HTTP)
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  path: '/',
};

// Logs the account in: creates a session and sets the cookie.
export function startSession(res, accountId) {
  deleteExpiredSessions.run();
  const token = crypto.randomBytes(32).toString('base64url');
  insertSession.run(hashToken(token), accountId);
  res.cookie(SESSION_COOKIE, token, cookieOptions);
}

// Pushes the 90 days forward, on the server and in the browser.
export function refreshSession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return;
  extendSession.run(hashToken(token));
  res.cookie(SESSION_COOKIE, token, cookieOptions);
}

export function endSession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) deleteSession.run(hashToken(token));
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions, maxAge: undefined });
}

export function endAllSessions(accountId) {
  deleteAccountSessions.run(accountId);
}

// Middleware: sets req.account to the logged-in account, or null.
export function loadAccount(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  req.account = token ? findSessionAccount.get(hashToken(token)) ?? null : null;
  next();
}

// --- Roles: 'player' | 'moderator' | 'admin'. ---
// Admins are listed by UUID in .env (ADMIN_UUIDS, comma-separated), so admin
// can never be granted from the website. Moderators are a role in the database.
const ADMIN_UUIDS = new Set(
  (process.env.ADMIN_UUIDS ?? '').split(',').map((u) => u.trim().toLowerCase()).filter(Boolean)
);

export function roleOf(account) {
  if (!account) return null;
  if (ADMIN_UUIDS.has(account.uuid.toLowerCase())) return 'admin';
  return account.role === 'moderator' ? 'moderator' : 'player';
}

// What the client is allowed to see about an account.
export function publicAccount(account) {
  const role = roleOf(account);
  return {
    name: account.name,
    uuid: account.uuid,
    role,
    created_at: account.created_at,
  };
}
