// server/lib/comments.js
//
// SQL shared by every query that returns comments. The comment table must be
// aliased `c`.

// A comment's accuracy is its latest vote ('accurate' | 'outdated' | NULL).
const LATEST_VOTE = `
  FROM comment_votes v WHERE v.comment_id = c.id ORDER BY v.created_at DESC, v.id DESC LIMIT 1
`;

export const ACCURACY_COLUMNS = `
  (SELECT v.vote ${LATEST_VOTE}) AS accuracy,
  (SELECT v.created_at ${LATEST_VOTE}) AS accuracy_at
`;

// For WHERE clauses: true unless the latest vote says outdated.
export const NOT_OUTDATED = `(SELECT v.vote ${LATEST_VOTE}) IS NOT 'outdated'`;

export const VOTES = ['accurate', 'outdated'];
