import { createContext, useContext } from 'react';

// The logged-in account, shared by the whole app (see AccountProvider).
// account: undefined while loading, null when logged out, else { name, uuid, role, created_at } (role: player | moderator | admin).
export const AccountContext = createContext({ account: undefined, setAccount: () => {}, logout: async () => {} });

export function useAccount() {
  return useContext(AccountContext);
}
