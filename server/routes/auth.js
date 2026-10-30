// server/routes/auth.js
//
// Account routes, mounted at /api/auth.
//   POST /claim   {code, password}  code from the verify server: creates the
//                                   account, or resets its password
//   POST /login   {name, password}
//   POST /logout
//   GET  /me                        the logged-in account, or null

import express from 'express';
import db from '../db/init.js';
import { ACCURACY_COLUMNS } from '../lib/comments.js';
import {
  PASSWORD_MAX, checkPassword, endAllSessions, endSession, hashPassword,
  passwordProblem, publicAccount, refreshSession, startSession,
} from '../lib/auth.js';
import { claimByIp, loginByIp, loginByName } from '../lib/rateLimits.js';

const router = express.Router();

const findCode = db.prepare(`
  SELECT * FROM verify_codes
  WHERE code = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
`);
const markCodeUsed = db.prepare(
  'UPDATE verify_codes SET used_at = CURRENT_TIMESTAMP WHERE code = ? AND used_at IS NULL'
);
const findAccountByUuid = db.prepare('SELECT * FROM accounts WHERE uuid = ?');
const findAccountByName = db.prepare('SELECT * FROM accounts WHERE name = ?'); // name is COLLATE NOCASE
const insertAccount = db.prepare('INSERT INTO accounts (uuid, name, password_hash) VALUES (?, ?, ?)');
const setPassword = db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?');
const getAccount = db.prepare('SELECT * FROM accounts WHERE id = ?');

// Checked against when the name doesn't exist, so a wrong name takes as long
// as a wrong password and can't be told apart by timing.
const DUMMY_HASH = await hashPassword('not-a-real-password');

router.post('/claim', claimByIp, async (req, res) => {
  const code = String(req.body.code ?? '').trim().toUpperCase();
  const problem = passwordProblem(req.body.password);
  if (problem) return res.status(400).json({ error: problem });

  const verified = findCode.get(code);
  if (!verified) {
    return res.status(400).json({
      error: 'That code is wrong or has expired. Join the verify server again for a new one.',
    });
  }

  // Hash before the transaction: it's async, and transactions must be synchronous.
  const passwordHash = await hashPassword(req.body.password);

  const result = db.transaction(() => {
    // Only one claim can use a code, even if two arrive at once.
    if (!markCodeUsed.run(code).changes) return { error: 'That code was already used.' };

    const existing = findAccountByUuid.get(verified.uuid);
    if (existing?.banned_at) return { error: 'This Minecraft account has been banned from the directory.' };
    if (existing) {
      // Password reset: also logs out every other device.
      setPassword.run(passwordHash, existing.id);
      endAllSessions(existing.id);
      return { accountId: existing.id, created: false };
    }

    try {
      const { lastInsertRowid } = insertAccount.run(verified.uuid, verified.name, passwordHash);
      return { accountId: lastInsertRowid, created: true };
    } catch (err) {
      // Another account still holds this name (someone renamed). Handled properly in step 2.5.
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return { error: 'Another account is using this name. Please contact the site admin.' };
      }
      throw err;
    }
  })();

  if (result.error) return res.status(400).json({ error: result.error });
  startSession(res, result.accountId);
  res.status(result.created ? 201 : 200).json({
    account: publicAccount(getAccount.get(result.accountId)),
    created: result.created,
  });
});

router.post('/login', loginByIp, loginByName, async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  const password = req.body.password;
  const fail = () => res.status(401).json({ error: 'Wrong name or password.' });
  if (!name || typeof password !== 'string' || password.length > PASSWORD_MAX) return fail();

  const account = findAccountByName.get(name);
  const ok = await checkPassword(password, account?.password_hash ?? DUMMY_HASH);
  if (!account || !ok) return fail();
  // Checked only after the password, so it doesn't reveal which names exist.
  if (account.banned_at) return res.status(403).json({ error: 'This account has been banned.' });

  startSession(res, account.id);
  res.json({ account: publicAccount(account) });
});

router.post('/logout', (req, res) => {
  endSession(req, res);
  res.json({ loggedOut: true });
});

// Called on each page load, which also keeps the 90-day login fresh.
router.get('/me', (req, res) => {
  if (!req.account) return res.json({ account: null });
  refreshSession(req, res);
  res.json({ account: publicAccount(req.account) });
});

// The logged-in account's comments, newest first, with the shop each is on
// (shop_closed_at is set if that shop has since closed).
const myComments = db.prepare(`
  SELECT c.id, c.body, c.created_at, s.plot_id,
    s.owner, s.shop_name, s.guild_name, s.closed_at AS shop_closed_at,
    ${ACCURACY_COLUMNS}
  FROM comments c JOIN shops s ON s.id = c.shop_id
  WHERE c.account_id = ? AND c.is_system = 0  -- not log entries from staff edits
  ORDER BY c.created_at DESC, c.id DESC
`);

router.get('/me/comments', (req, res) => {
  if (!req.account) return res.status(401).json({ error: 'Not logged in' });
  res.json(myComments.all(req.account.id));
});

// Deletes the logged-in account. Body: { confirm_name } must match the
// account's name. Their comments stay but become Anonymous; their votes and
// sessions are removed. Staff log entries and mod log entries keep the name as
// plain text, so history still says who made a change.
const deleteAccount = db.transaction((accountId) => {
  db.prepare('UPDATE comments SET account_id = NULL, author = NULL WHERE account_id = ? AND is_system = 0').run(accountId);
  db.prepare('UPDATE comments SET account_id = NULL WHERE account_id = ? AND is_system = 1').run(accountId);
  db.prepare('DELETE FROM comment_votes WHERE account_id = ?').run(accountId);
  db.prepare('UPDATE mod_log SET account_id = NULL WHERE account_id = ?').run(accountId);
  endAllSessions(accountId);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
});

router.delete('/me', (req, res) => {
  if (!req.account) return res.status(401).json({ error: 'Not logged in' });
  const typed = String(req.body?.confirm_name ?? '').trim().toLowerCase();
  if (typed !== req.account.name.toLowerCase()) {
    return res.status(400).json({ error: 'Type your Minecraft name exactly to confirm.' });
  }
  deleteAccount(req.account.id);
  endSession(req, res); // clears the cookie
  res.json({ deleted: true });
});

export default router;
