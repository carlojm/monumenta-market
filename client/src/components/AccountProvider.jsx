import { useEffect, useState } from 'react';
import { AccountContext } from '../lib/account';

// Asks the server who's logged in once when the site loads (which also keeps
// the 90-day login fresh), and shares the answer with every component.
function AccountProvider({ children }) {
  const [account, setAccount] = useState(undefined);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => setAccount(data.account))
      .catch(() => setAccount(null));
  }, []);

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
