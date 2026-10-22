import { useState } from 'react';
import { getAdminToken, clearAdminToken } from '../lib/adminAuth';
import AdminLogin from './AdminLogin';
import AdminPlotEditor from './AdminPlotEditor';
import AdminComments from './AdminComments';

function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(!!getAdminToken());
  const [tab, setTab] = useState('plots');

  if (!loggedIn) {
    return <AdminLogin onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <div className="admin-page">
      <div className="admin-page__tabs">
        <button onClick={() => setTab('plots')}>Plots</button>
        <button onClick={() => setTab('comments')}>Comments</button>
        <button onClick={() => { clearAdminToken(); setLoggedIn(false); }}>Log out</button>
      </div>
      {tab === 'plots' ? <AdminPlotEditor /> : <AdminComments />}
    </div>
  );
}

export default AdminPage;