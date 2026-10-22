// Admin requests are authorized by the logged-in account's role (moderator or
// admin); the browser sends the login cookie automatically. The old shared
// admin token is no longer used by the site, so clear any copy left behind.
try {
  localStorage.removeItem('admin_token');
} catch {
  // storage blocked: nothing to clear
}

export function adminFetch(url, options = {}) {
  return fetch(url, options);
}
