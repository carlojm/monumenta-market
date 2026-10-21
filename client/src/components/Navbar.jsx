import { Link } from 'react-router-dom';
import { BadgeCheck, User } from 'lucide-react';
import { useAccount } from '../lib/account';

function Navbar() {
  const { account } = useAccount();

  return (
    <nav className="navbar">
      <Link to="/" className="navbar__logo">Market Directory</Link>
      <Link to="/account" className="navbar__account" aria-label={account ? `Account: ${account.name}` : 'Log in'}>
        <User size={18} aria-hidden="true" />
        {/* Empty while loading, so it doesn't flash "Log in" for someone logged in. */}
        {account === undefined ? null : account ? (
          <>
            <span className="navbar__account-name">{account.name}</span>
            <BadgeCheck size={15} className="navbar__account-check" aria-hidden="true" />
          </>
        ) : (
          <span>Log in</span>
        )}
      </Link>
    </nav>
  );
}

export default Navbar;
