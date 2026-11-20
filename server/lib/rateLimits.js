// server/lib/rateLimits.js
//
// Caps on how often one visitor can do something, to stop password and code
// guessing, spam, and floods. Counts live in memory: fine for one machine,
// and they reset when the server restarts.
//
// Visitors are counted by IP address unless a limit says otherwise. IPv6
// addresses are grouped by network (/56), since one home gets a whole range.
// On Fly, index.js sets 'trust proxy' so req.ip is the visitor, not Fly's proxy.
//
// Every limit answers the same way: 429, a Retry-After header, and
// { error } with a message the site shows as it is.
// Logs say which limit was hit but never the IP, to keep players anonymous.

import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

const MINUTE = 60_000;

const tooMany = (wait) => `Too many tries. Please wait ${wait} and try again.`;

function limit(name, { minutes, max, message = tooMany, ...options }) {
  return rateLimit({
    windowMs: minutes * MINUTE,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...options,
    handler: (req, res) => {
      const minutesLeft = Math.max(1, Math.ceil((req.rateLimit.resetTime - Date.now()) / MINUTE));
      console.warn(`Rate limit hit: ${name}`);
      res.status(429).json({ error: message(`${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}`) });
    },
  });
}

// Only failed logins count (skipSuccessfulRequests), so players who type their
// password right are never slowed down. Counted per IP, and also per account
// name so a bot switching IPs can't keep guessing one player's password.
// The name limit blocks the real player too, so it's set higher than the IP
// limit: one person on one IP runs out first and can't lock anyone out. Only
// a bot spread over many IPs reaches it, and even then the block is temporary
// and the player can still reset their password with a new verify code.
export const loginByIp = limit('login (ip)', { minutes: 15, max: 10, skipSuccessfulRequests: true });
export const loginByName = limit('login (name)', {
  minutes: 15,
  max: 30,
  message: (wait) => `Too many wrong passwords for this account. Please wait ${wait}, or reset your password with a new code from the verify server.`,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `name:${String(req.body?.name ?? '').trim().toLowerCase()}`,
});

// Verify codes are short (5 characters), so guessing has to be slow.
export const claimByIp = limit('claim (ip)', { minutes: 15, max: 10, skipSuccessfulRequests: true });

// --- Writes (5.6b). Every attempt counts, not just failures. ---

// Actions that need an account count per account, so people sharing an IP
// (a household, a school) don't use up each other's limit. A request with no
// account (which the route will refuse anyway) counts by IP.
const byAccount = (req) => (req.account ? `account:${req.account.id}` : ipKeyGenerator(req.ip));
const tooOften = (wait) => `You're doing that too often. Please wait ${wait} and try again.`;
const write = (name, options) => limit(name, { message: tooOften, ...options });

// Reports don't need an account, so they're the easiest to spam: counted by IP.
export const reports = write('report', { minutes: 60, max: 20 });
export const comments = write('comment', { minutes: 10, max: 10, keyGenerator: byAccount });
export const votes = write('vote', { minutes: 10, max: 60, keyGenerator: byAccount });
export const tagEdits = write('tag edit', { minutes: 10, max: 30, keyGenerator: byAccount });
export const tagSuggestions = write('tag suggestion', { minutes: 60, max: 10, keyGenerator: byAccount });
export const uploads = write('upload', { minutes: 60, max: 30, keyGenerator: byAccount });
export const revisions = write('page edit', { minutes: 60, max: 20, keyGenerator: byAccount });

// --- Safety net (5.6c) on every /api request, for floods on routes with no
// limit of their own (like the plot list). Far above what browsing needs.
export const api = limit('api (ip)', {
  minutes: 1,
  max: 300,
  message: (wait) => `Too many requests from your connection. Please wait ${wait} and try again.`,
});
