// server/lib/modlog.js
//
// Records staff actions in mod_log (shown to admins in Admin → Mod log).

import db from '../db/init.js';

const insert = db.prepare(
  'INSERT INTO mod_log (account_id, actor_name, action, target, details) VALUES (?, ?, ?, ?, ?)'
);

// `req.account` is the staff member; it's null if the emergency ADMIN_TOKEN was used.
export function logModAction(req, action, target, details) {
  insert.run(req.account?.id ?? null, req.account?.name ?? null, action, target, details);
}
