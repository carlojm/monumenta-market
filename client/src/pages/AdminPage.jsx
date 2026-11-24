import { Suspense, use, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAccount } from '../lib/account';
import AdminPlotEditor from './AdminPlotEditor';
import AdminComments from './AdminComments';
import AdminAccounts from './AdminAccounts';
import AdminModLog from './AdminModLog';
import AdminTags from './AdminTags';
import AdminReview from './AdminReview';
import { loadReview } from '../lib/review';

// The number on the Needs review tab, once the queue has loaded.
function ReviewCount({ promise, reviewed }) {
  const data = use(promise);
  if (data.error) return null;
  const edits = data.list.filter((e) => e.can_review && !reviewed.includes(e.id)).length;
  const images = data.images.filter((i) => !reviewed.includes(`image-${i.id}`)).length;
  return ` (${edits + images})`;
}

// The tabs, for staff. Needs review comes first and opens by default: it's
// the moderators' main job. Its queue starts loading as soon as this appears
// (in useState's initializer, which runs once), and again on Refresh.
function StaffArea({ account }) {
  const [tab, setTab] = useState('review');
  const [reviewPromise, setReviewPromise] = useState(() => loadReview());
  const [reviewed, setReviewed] = useState([]); // ids approved or rejected since loading
  const refreshReview = () => {
    setReviewPromise(loadReview());
    setReviewed([]);
  };

  return (
    <>
      <div className="admin-page__tabs">
        <button onClick={() => setTab('review')} aria-pressed={tab === 'review'}>
          Needs review
          <Suspense fallback={null}><ReviewCount promise={reviewPromise} reviewed={reviewed} /></Suspense>
        </button>
        <button onClick={() => setTab('plots')} aria-pressed={tab === 'plots'}>Plots</button>
        <button onClick={() => setTab('comments')} aria-pressed={tab === 'comments'}>Comments</button>
        <button onClick={() => setTab('tags')} aria-pressed={tab === 'tags'}>Tags</button>
        {/* Accounts (making moderators) is for admins only. */}
        {account.role === 'admin' && (
          <button onClick={() => setTab('accounts')} aria-pressed={tab === 'accounts'}>Accounts</button>
        )}
        <button onClick={() => setTab('modlog')} aria-pressed={tab === 'modlog'}>Mod log</button>
      </div>
      {tab === 'review' && (
        <Suspense fallback={<p>Loading…</p>}>
          <AdminReview promise={reviewPromise} reviewed={reviewed}
            onReviewed={(id) => setReviewed((ids) => [...ids, id])} onRefresh={refreshReview} />
        </Suspense>
      )}
      {tab === 'plots' && <AdminPlotEditor />}
      {tab === 'comments' && <AdminComments />}
      {tab === 'tags' && <AdminTags />}
      {tab === 'accounts' && account.role === 'admin' && <AdminAccounts />}
      {tab === 'modlog' && <AdminModLog />}
    </>
  );
}

// Staff only: moderators and admins. Access comes from the logged-in account.
function AdminPage() {
  const { account } = useAccount();
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
          <StaffArea account={account} />
        )}
      </div>
    </div>
  );
}

export default AdminPage;
