// server/lib/modlog.js
//
// Records staff actions, comment activity and page revisions in mod_log
// (shown to staff in Admin → Mod log).

import db from '../db/init.js';

const insert = db.prepare(
  'INSERT INTO mod_log (account_id, actor_name, action, target, details, revision_id, data) VALUES (?, ?, ?, ?, ?, ?, ?)'
);

// `req.account` is who did it; it's null if the emergency ADMIN_TOKEN was used.
// `data` (optional) is saved as JSON for the Mod log to show in detail.
export function logModAction(req, action, target, details, { revisionId = null, data = null } = {}) {
  insert.run(req.account?.id ?? null, req.account?.name ?? null, action, target, details,
    revisionId, data == null ? null : JSON.stringify(data));
}
