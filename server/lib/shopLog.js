// server/lib/shopLog.js
//
// A shop's log entries: the "Update" lines on the card, stored as system
// comments. `actor` is the account that made the change (shown as
// "Update by …"), or null.

import db from '../db/init.js';

const insertSystemComment = db.prepare(`
  INSERT INTO comments (shop_id, account_id, author, body, is_system, status) VALUES (?, ?, ?, ?, 1, 'approved')
`);

export function addLogEntry(shopId, actor, body) {
  insertSystemComment.run(shopId, actor?.id ?? null, actor?.name ?? null, body);
}
