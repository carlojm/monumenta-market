import { useEffect, useState } from 'react';
import './PlotDetail.css';
import { canReport, recordReport, cooldownRemainingMinutes, timeAgo, formatDate } from '../lib/reports';
import { ACTIVITIES, ACTIVITY_LABELS, LOCKS, displayName, ownerLabel, reportLabel } from '../lib/plots';

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

function CommentList({ comments }) {
  if (!comments.length) return <p className="plot-detail__empty">No comments yet.</p>;
  return (
    <ul className="plot-detail__comments">
      {comments.map((c) => (
        <li
          key={c.id}
          className={c.is_system ? 'plot-detail__comment--system' : c.pending ? 'plot-detail__comment--pending' : ''}
        >
          {c.is_system ? (
            <span className="plot-detail__comment-tag">Update</span>
          ) : (
            <strong>{c.author || 'Anonymous'}</strong>
          )}
          {c.pending && <span className="plot-detail__comment-tag">Pending approval</span>}
          <p>{c.body}</p>
          <time>{formatDate(c.created_at)}</time>
        </li>
      ))}
    </ul>
  );
}

// A past shop, loaded the first time it's expanded.
function PastShop({ summary }) {
  const [shop, setShop] = useState(null);
  const load = (e) => {
    if (!e.currentTarget.open || shop) return;
    fetch(`/api/shops/${summary.id}`).then((res) => res.json()).then(setShop);
  };
  return (
    <details className="plot-detail__past-shop" onToggle={load}>
      <summary>
        {displayName(summary)}
        <span className="plot-detail__muted"> · closed {formatDate(summary.closed_at)}</span>
      </summary>
      {!shop ? (
        <p className="plot-detail__muted">Loading…</p>
      ) : (
        <>
          {shop.description && <p className="plot-detail__description">{shop.description}</p>}
          {shop.stock && <p><span className="plot-detail__label">Stock:</span> {shop.stock}</p>}
          <CommentList comments={shop.comments} />
        </>
      )}
    </details>
  );
}

function ReportForm({ plotId, onReported }) {
  const [activity, setActivity] = useState(null);
  const [lock, setLock] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const allowed = canReport(plotId);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await postJson(`/api/plots/${plotId}/report`, { activity, lock });
      recordReport(plotId);
      onReported({ activity, lock, created_at: new Date().toISOString() });
      setActivity(null);
      setLock(null);
    } catch (err) {
      setError(`Could not submit report: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!allowed) {
    return (
      <p className="plot-detail__muted">
        Thanks for reporting. You can report this plot again in {cooldownRemainingMinutes(plotId)}m.
      </p>
    );
  }

  const toggle = (current, value, set) => set(current === value ? null : value);
  // A lock state is required, except for a vacant plot (nothing to lock).
  const canSubmit = !!lock || activity === 'vacant';

  return (
    <div className="plot-detail__report-form">
      <span className="plot-detail__muted">Were you just here? Report what you saw:</span>
      <div className="plot-detail__chips" role="group" aria-label="Activity">
        {ACTIVITIES.map((a) => (
          <button key={a} type="button" aria-pressed={activity === a} onClick={() => toggle(activity, a, setActivity)}>
            {ACTIVITY_LABELS[a]}
          </button>
        ))}
      </div>
      <div className="plot-detail__chips" role="group" aria-label="Lock">
        {LOCKS.map((l) => (
          <button key={l} type="button" aria-pressed={lock === l} onClick={() => toggle(lock, l, setLock)}>
            {l === 'locked' ? 'Locked' : 'Unlocked'}
          </button>
        ))}
      </div>
      {(activity || lock) && (
        canSubmit ? (
          <button type="button" className="plot-detail__submit" onClick={submit} disabled={submitting}>
            {submitting ? 'Sending…' : `Report ${reportLabel({ activity, lock })}`}
          </button>
        ) : (
          <span className="plot-detail__muted">Also pick locked or unlocked.</span>
        )
      )}
      {error && <p className="plot-detail__error">{error}</p>}
    </div>
  );
}

function PlotDetail({ plot, onClose, onReported, inline = false }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [commentBody, setCommentBody] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myComments, setMyComments] = useState([]);
  const [myReports, setMyReports] = useState([]);

  useEffect(() => {
    if (!plot) return;
    fetch(`/api/plots/${plot.id}`)
      .then((res) => res.json())
      .then(setDetail)
      .catch((err) => setError(err.message));
  }, [plot]);

  if (!plot) return null;

  const shop = detail ? detail.shop : plot.shop;
  const images = shop?.images || [];
  const comments = [...myComments, ...(shop?.comments || [])];
  const reports = [...myReports, ...(detail?.reports || [])];
  // The server's latest_report already fills in a missing part from earlier
  // reports. A report submitted here is merged on top the same way.
  const serverReport = detail?.latest_report ?? plot.latest_report;
  const myReport = myReports[0];
  const latestReport = myReport
    ? {
        activity: myReport.activity ?? serverReport?.activity ?? null,
        lock: myReport.lock ?? serverReport?.lock ?? null,
        created_at: myReport.created_at,
      }
    : serverReport;
  const pastShops = detail?.past_shops || [];

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setSubmitting(true);
    const body = commentBody.trim();
    const author = commentAuthor.trim() || null;
    try {
      await postJson(`/api/plots/${plot.id}/comments`, { body, author });
      setMyComments((prev) => [
        { id: `pending-${Date.now()}`, author, body, created_at: new Date().toISOString(), pending: true },
        ...prev,
      ]);
      setCommentBody('');
    } catch (err) {
      setError(`Could not submit comment: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReported = (report) => {
    setMyReports((prev) => [report, ...prev]);
    onReported?.();
  };

  // `inline` (desktop): the card sits in the page's right column with a back
  // button. Otherwise (phones): a bottom sheet over a dark overlay.
  const sheet = (
      <div
        className={`plot-detail__sheet${inline ? ' plot-detail__sheet--inline' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {inline ? (
          <button className="plot-detail__back" onClick={onClose}>← Back to list</button>
        ) : (
          <button className="plot-detail__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}

        <h2>{displayName(shop)}</h2>

        {images.length > 0 && (
          <div className="plot-detail__carousel">
            <img src={images[imageIndex].url} alt={`${displayName(shop)} photo ${imageIndex + 1}`} />
            {images.length > 1 && (
              <>
                <button
                  className="plot-detail__carousel-nav plot-detail__carousel-nav--prev"
                  onClick={() => setImageIndex((i) => (i - 1 + images.length) % images.length)}
                  aria-label="Previous image"
                >
                  ‹
                </button>
                <button
                  className="plot-detail__carousel-nav plot-detail__carousel-nav--next"
                  onClick={() => setImageIndex((i) => (i + 1) % images.length)}
                  aria-label="Next image"
                >
                  ›
                </button>
                <div className="plot-detail__carousel-count">
                  {imageIndex + 1} / {images.length}
                </div>
              </>
            )}
          </div>
        )}

        <dl className="plot-detail__meta">
          {shop && (
            <>
              <dt>{shop.guild_name ? 'Guild' : 'Owner'}</dt>
              <dd>{ownerLabel(shop)}</dd>
            </>
          )}
          <dt>Plot</dt>
          <dd><span className="coord">{plot.id}</span></dd>
          <dt>Coords</dt>
          <dd className="coord">{plot.x}, {plot.z}</dd>
          {shop?.palette && (
            <>
              <dt>Palette</dt>
              <dd>{shop.palette}</dd>
            </>
          )}
          <dt>Status</dt>
          <dd className="plot-detail__status">
            {latestReport ? (
              <span>
                {reportLabel(latestReport)}{' '}
                <span className="plot-detail__muted">{timeAgo(latestReport.created_at)}</span>
              </span>
            ) : (
              <span className="plot-detail__muted">No reports yet</span>
            )}
            {reports.length > 1 && (
              <details className="plot-detail__history">
                <summary>History ({reports.length})</summary>
                <ul>
                  {reports.map((r, i) => (
                    <li key={i}>
                      {reportLabel(r)} <span className="plot-detail__muted">{timeAgo(r.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <ReportForm plotId={plot.id} onReported={handleReported} />
          </dd>
        </dl>

        {shop?.description && (
          <p className="plot-detail__description">
            <span className="plot-detail__label">About:</span> {shop.description}
          </p>
        )}
        {shop?.stock && (
          <p className="plot-detail__description">
            <span className="plot-detail__label">Keywords:</span> {shop.stock}
          </p>
        )}
        {!shop && <p className="plot-detail__muted">Nobody has a shop on this plot right now.</p>}

        {error && <p className="plot-detail__error">{error}</p>}

        {shop && (
          <>
            <hr />
            <h3>Comments</h3>
            <p className="plot-detail__comment-hint">
              Leave a comment if this shop is different from described.
              Comments must be approved before they're shown to others.
            </p>

            <form className="plot-detail__comment-form" onSubmit={handleSubmitComment}>
              <input
                type="text"
                placeholder="Name (optional)"
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
              />
              <textarea
                placeholder="This shop has changed / is now selling..."
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                required
              />
              <button type="submit" disabled={submitting}>
                {submitting ? 'Posting…' : 'Post comment'}
              </button>
            </form>

            <CommentList comments={comments} />
          </>
        )}

        {pastShops.length > 0 && (
          <>
            <hr />
            <h3>Past shops on this plot</h3>
            {pastShops.map((s) => <PastShop key={s.id} summary={s} />)}
          </>
        )}
      </div>
  );

  if (inline) return sheet;
  return (
    <div className="plot-detail__overlay" onClick={onClose}>
      {sheet}
    </div>
  );
}

export default PlotDetail;
