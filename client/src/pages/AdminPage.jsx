import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAccount } from '../lib/account';
import AdminPlotEditor from './AdminPlotEditor';
import AdminComments from './AdminComments';
import AdminAccounts from './AdminAccounts';

// Staff only: moderators and admins. Access comes from the logged-in account.
function AdminPage() {
  const { account } = useAccount();
  const [tab, setTab] = useState('plots');
  const isStaff = account && (account.role === 'moderator' || account.role === 'admin');

  return (
    <div>
      <Navbar />
      <div className="admin-page">
        {account === undefined ? null : !account ? (
          <p>
            <Link to="/account">Log in</Link> with a moderator or admin account to use this page.
          </p>
        ) : !isStaff ? (
          <p>You don't have access to this page.</p>
        ) : (
          <>
            <div className="admin-page__tabs">
              <button onClick={() => setTab('plots')} aria-pressed={tab === 'plots'}>Plots</button>
              <button onClick={() => setTab('comments')} aria-pressed={tab === 'comments'}>Comments</button>
              {/* Accounts (making moderators) is for admins only. */}
              {account.role === 'admin' && (
                <button onClick={() => setTab('accounts')} aria-pressed={tab === 'accounts'}>Accounts</button>
              )}
            </div>
            {tab === 'plots' && <AdminPlotEditor />}
            {tab === 'comments' && <AdminComments />}
            {tab === 'accounts' && account.role === 'admin' && <AdminAccounts />}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminPage;
