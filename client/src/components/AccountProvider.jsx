import { createResource, useResource } from '../lib/resource';
import { AccountContext } from '../lib/account';

// Who's logged in: asked once when the site loads (which also keeps the
// 90-day login fresh), and shared with every component. undefined while
// loading, null when logged out (lib/resource.js loads it, no effect).
const accountResource = createResource(
  () => fetch('/api/auth/me').then((res) => res.json()).then((data) => data.account).catch(() => null),
  undefined,
);

function AccountProvider({ children }) {
  const account = useResource(accountResource).data;
  const setAccount = accountResource.set;

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAccount(null);
  };

  return (
    <AccountContext.Provider value={{ account, setAccount, logout }}>
      {children}
    </AccountContext.Provider>
  );
}

export default AccountProvider;
