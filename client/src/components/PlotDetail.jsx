import { useEffect, useState } from 'react';
import './PlotDetail.css';
import { canReport, recordReport, cooldownRemainingMinutes, timeAgo } from '../lib/reports';

function PlotDetail({ plot, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [commentBody, setCommentBody] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState([]);

  const [latestReport, setLatestReport] = useState(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const [pendingVote, setPendingVote] = useState(null); // 'open' | 'closed' | null
  const requestVote = (type) => {
    setPendingVote(type);
  };
  const confirmVote = async () => {
    const type = pendingVote;
    setPendingVote(null);
    await handleReport(type);
  };
  const cancelVote = () => {
    setPendingVote(null);
  };

  useEffect(() => {
    if (!plot) return;
    setImageIndex(0);
    setOptimisticComments([]);
    fetch(`/api/plots/${plot.x}/${plot.z}`)
      .then((res) => res.json())
      .then((data) => {
        setDetail(data);
        setLatestReport(data.latestReport);
      })
      .catch((err) => setError(err.message));
  }, [plot]);

  if (!plot) return null;

  const images = detail?.images || [];
  const comments = [...optimisticComments, ...(detail?.comments || [])];

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setSubmitting(true);

    const body = commentBody.trim();
    const author = commentAuthor.trim() || null;

    try {
      await fetch(`/api/plots/${plot.x}/${plot.z}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, author }),
      });

      setOptimisticComments((prev) => [
        {
          id: `pending-${Date.now()}`,
          author,
          body,
          created_at: new Date().toISOString(),
          pending: true,
        },
        ...prev,
      ]);
      setCommentBody('');
    } catch (err) {
      setError('Could not submit comment: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReport = async (reportType) => {
    setReportSubmitting(true);
    try {
      await fetch(`/api/plots/${plot.x}/${plot.z}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: reportType }),
      });
      recordReport(plot.x, plot.z);
      setLatestReport({ report_type: reportType, created_at: new Date().toISOString() });
    } catch (err) {
      setError('Could not submit report: ' + err.message);
    } finally {
      setReportSubmitting(false);
    }
  };

  const canReportNow = plot && canReport(plot.x, plot.z);
  const cooldownMins = plot ? cooldownRemainingMinutes(plot.x, plot.z) : 0;

  return (
    <div className="plot-detail__overlay" onClick={onClose}>
      <div className="plot-detail__sheet" onClick={(e) => e.stopPropagation()}>
        <button className="plot-detail__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2>{plot.shop_name || plot.owner || `Plot ${plot.x}, ${plot.z}`}</h2>

        {images.length > 0 && (
          <div className="plot-detail__carousel">
            <img src={images[imageIndex].url} alt={`${plot.owner || 'shop'} photo ${imageIndex + 1}`} />
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
          <dt>Owner</dt>
          <dd>{plot.owner || '—'}</dd>
          <dt>Coords</dt>
          <dd>{plot.x}, {plot.z}</dd>
          <dt>Zone</dt>
          <dd>{plot.zone || '—'}</dd>
          <dt>Status</dt>
          <dd className="plot-detail__status">
            <div className="plot-detail__status-line">
              {/* <span>{plot.status}</span> */}
              <span className="plot-detail__status-report">
                {latestReport
                  ? `last reported ${latestReport.report_type} ${timeAgo(latestReport.created_at)}`
                  : 'no reports yet'}
              </span>
            </div>

            {pendingVote ? (
              <div className="plot-detail__status-confirm">
                <span>Mark this shop as currently {pendingVote}?</span>
                <div className="plot-detail__status-confirm-actions">
                  <button onClick={confirmVote} disabled={reportSubmitting}>Confirm</button>
                  <button onClick={cancelVote} disabled={reportSubmitting}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="plot-detail__status-actions">
                <button
                  className="plot-detail__vote-btn"
                  disabled={!canReportNow}
                  onClick={() => requestVote('open')}
                  aria-label="Report open"
                >
                  It's open
                </button>
                <button
                  className="plot-detail__vote-btn"
                  disabled={!canReportNow}
                  onClick={() => requestVote('closed')}
                  aria-label="Report closed"
                >
                  It's closed
                </button>
                {!canReportNow && <span className="plot-detail__status-cooldown">again in {cooldownMins}m</span>}
              </div>
            )}
          </dd>
        </dl>

        {plot.description && <p className="plot-detail__description">{plot.description}</p>}

        <hr />

        <h3>Comments</h3>
        <p className="plot-detail__comment-hint">
          Leave a comment or suggested change if this plot is different from described.
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

        {error && <p className="plot-detail__error">{error}</p>}

        <ul className="plot-detail__comments">
          {comments.map((c) => (
            <li
              key={c.id}
              className={
                c.is_system ? 'plot-detail__comment--system' : c.pending ? 'plot-detail__comment--pending' : ''
              }
            >
              {c.is_system ? (
                <span className="plot-detail__comment-tag">Update</span>
              ) : (
                <strong>{c.author || 'Anonymous'}</strong>
              )}
              {c.pending && <span className="plot-detail__comment-tag">Pending approval</span>}
              <p>{c.body}</p>
              <time>{new Date(c.created_at).toLocaleDateString()}</time>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default PlotDetail;