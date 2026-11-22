import { use, useRef, useState } from 'react';
import { PendingEditItem } from '../components/PendingEdits';
import ReviewActions from '../components/ReviewActions';
import { displayName } from '../lib/plots';
import { tagNamer } from '../lib/shopFields';

// Admin → Needs review: every suggestion waiting for review, oldest first,
// with Approve / Reject. `promise` is loadReview(), started by AdminPage, read
// here with use() (React shows the Suspense fallback until it's ready).
// `reviewed` lists the ids reviewed here, which drop out of the list.
function AdminReview({ promise, reviewed, onReviewed, onRefresh }) {
  const data = use(promise);
  const [status, setStatus] = useState('');
  const headingRef = useRef(null);

  if (data.error) {
    return (
      <div className="admin-review">
        <p role="alert">{data.error}</p>
        <button type="button" onClick={onRefresh}>Try again</button>
      </div>
    );
  }

  const items = data.list.filter((e) => !reviewed.includes(e.id));
  // The reviewed item (and its buttons) is gone, so focus moves to the heading.
  const done = (edit, outcome) => {
    onReviewed(edit.id);
    setStatus(`${outcome === 'approved' ? 'Approved' : 'Rejected'}: ${edit.author ?? 'a deleted account'}'s edit to ${edit.plot_id}.`);
    headingRef.current?.focus();
  };

  return (
    <div className="admin-review">
      <div className="admin-review__top">
        <h2 ref={headingRef} tabIndex={-1}>Needs review</h2>
        <button type="button" onClick={onRefresh}>Refresh</button>
      </div>
      <p className="admin-review__status" role="status">{status}</p>
      {items.length === 0 ? (
        <p className="admin-review__muted">Nothing waiting for review.</p>
      ) : (
        <ul className="admin-review__list">
          {items.map((e) => (
            <li key={e.id} className="admin-review__item">
              <div className="admin-review__plot">
                <a href={`/plot/${e.plot_id}`} target="_blank" rel="noreferrer">{displayName(e.shop)}</a>
                <span className="coord">{e.plot_id}</span>
              </div>
              <PendingEditItem edit={e} tagName={tagNamer(data.catalog, e.shop?.tags)}>
                {e.can_review && <ReviewActions edit={e} onReviewed={(outcome) => done(e, outcome)} />}
              </PendingEditItem>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AdminReview;
