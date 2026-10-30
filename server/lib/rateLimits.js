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

import { rateLimit } from 'express-rate-limit';

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
