import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import './PlotDetail.css';
import { useAccount } from '../lib/account';
import TagChips from './TagChips';
import TagEditor from './TagEditor';
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

const ACCURACY_LABELS = { accurate: 'Accurate', outdated: 'Outdated' };

// One comment. With `interactive` (the current shop's comments), logged-in
// players can vote on its accuracy, and delete it if it's theirs.
function CommentItem({ comment: c, interactive, onDeleted }) {
  const { account } = useAccount();
  const [accuracy, setAccuracy] = useState({ value: c.accuracy, at: c.accuracy_at });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState(null);
  // Cancelling the delete confirmation puts focus back on the Delete button
  // (it was replaced by the confirmation, so focus would otherwise be lost).
  const deleteButton = useRef(null);
  const refocusDelete = useRef(false);
  useEffect(() => {
    if (!confirmingDelete && refocusDelete.current) {
      refocusDelete.current = false;
      deleteButton.current?.focus();
    }
  }, [confirmingDelete]);
  const isOwn = !!account && !!c.verified && c.author === account.name;
  const isStaff = account?.role === 'moderator' || account?.role === 'admin';
  const canAct = interactive && !!account && !c.is_system;
  // Players can delete their own comments; staff can delete anyone's.
  const canDelete = isOwn || isStaff;

  const vote = async (value) => {
    if (accuracy.value === value) return;
    setError(null);
    try {
      const result = await postJson(`/api/comments/${c.id}/vote`, { vote: value });
      setAccuracy({ value: result.accuracy, at: result.accuracy_at });
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async () => {
    // Staff removing someone else's comment go through the admin route, so it's
    // recorded in the mod log.
    const url = isOwn ? `/api/comments/${c.id}` : `/api/admin/comments/${c.id}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) return setError('Could not delete the comment. Please try again.');
    onDeleted(c.id);
  };

  const classes = [
    c.is_system && 'plot-detail__comment--system',
    accuracy.value === 'outdated' && 'plot-detail__comment--outdated',
  ].filter(Boolean).join(' ');

  return (
    <li className={classes}>
      {c.is_system ? (
        <span>
          <span className="plot-detail__comment-tag">Update</span>
          {/* Staff edits record who made them. */}
          {c.author && <span className="plot-detail__muted"> by {c.author}</span>}
        </span>
      ) : c.verified ? (
        // Linked accounts stand out by brightness rather than an icon.
        <strong className="plot-detail__author plot-detail__author--linked" title="Linked Minecraft account">
          {c.author}
        </strong>
      ) : (
        <strong className={`plot-detail__author${c.author ? '' : ' plot-detail__author--anonymous'}`}>
          {c.author || 'Anonymous'}
        </strong>
      )}
      <p>{c.body}</p>
      <div className="plot-detail__comment-footer">
        <time>{formatDate(c.created_at)}</time>
        {accuracy.value && (
          <span className="plot-detail__accuracy">
            {ACCURACY_LABELS[accuracy.value]} <span className="plot-detail__muted">{timeAgo(accuracy.at)}</span>
          </span>
        )}
      </div>

      {canAct && (
        confirmingDelete ? (
          <div className="plot-detail__comment-actions">
            <span className="plot-detail__muted">
              {isOwn ? 'Delete this comment?' : `Delete ${c.author || 'Anonymous'}'s comment?`}
            </span>
            <button type="button" onClick={remove}>Yes</button>
            {/* Focus starts on the safe choice. */}
            <button type="button" autoFocus onClick={() => { refocusDelete.current = true; setConfirmingDelete(false); }}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="plot-detail__comment-actions">
            <button type="button" aria-pressed={accuracy.value === 'accurate'} onClick={() => vote('accurate')}>
              Still accurate
            </button>
            <button type="button" aria-pressed={accuracy.value === 'outdated'} onClick={() => vote('outdated')}>
              Outdated
            </button>
            {canDelete && (
              <button type="button" ref={deleteButton} onClick={() => setConfirmingDelete(true)}>Delete</button>
            )}
          </div>
        )
      )}
      {error && <p className="plot-detail__error" role="alert">{error}</p>}
    </li>
  );
}

function CommentList({ comments, interactive = false, onDeleted }) {
  if (!comments.length) return <p className="plot-detail__empty">No comments yet</p>;
  return (
    <ul className="plot-detail__comments">
      {comments.map((c) => (
        <CommentItem key={c.id} comment={c} interactive={interactive} onDeleted={onDeleted} />
      ))}
    </ul>
  );
}

// About and Keywords rows. They go inside the card's <dl>, so their labels
// share one column with Owner, Plot and Status. The shop's stock tags sit
// under Keywords; `after` is the "+" edit button.
function ShopText({ shop, tags, after = null }) {
  const showKeywords = shop.stock || tags.length > 0 || after;
  return (
    <>
      {shop.description && (
        <>
          <dt>About</dt>
          <dd className="plot-detail__text">{shop.description}</dd>
        </>
      )}
      {showKeywords && (
        <>
          <dt>Keywords</dt>
          <dd className="plot-detail__text">
            {shop.stock}
            <TagChips tags={tags} className="plot-detail__stock-tags" after={after} />
          </dd>
        </>
      )}
    </>
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
        {' '}<span className="plot-detail__muted">closed {formatDate(summary.closed_at)}</span>
      </summary>
      {!shop ? (
        <p className="plot-detail__muted">Loading…</p>
      ) : (
        <>
          <dl className="plot-detail__meta"><ShopText shop={shop} tags={shop.tags} /></dl>
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
        Thanks for reporting. You can report again in {cooldownRemainingMinutes(plotId)}m.
      </p>
    );
  }

  const toggle = (current, value, set) => set(current === value ? null : value);
  // A lock state is required, except for a vacant plot (nothing to lock).
  const canSubmit = !!lock || activity === 'vacant';

  return (
    <div className="plot-detail__report-form">
      <span className="plot-detail__muted">Report what you see here</span>
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
      {error && <p className="plot-detail__error" role="alert">{error}</p>}
    </div>
  );
}

// Older browsers without `closedby` need tap-outside-to-close done by hand.
const SUPPORTS_CLOSEDBY = typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;

function PlotDetail({ plot, onClose, onReported, inline = false, openedInApp = false }) {
  const [detail, setDetail] = useState(null);
  const dialogRef = useRef(null);
  const headingRef = useRef(null);
  const commentsHeadingRef = useRef(null);
  // Read out by screen readers (visually hidden): "Report sent", etc.
  const [announcement, setAnnouncement] = useState('');
  // The dialog's close listener is set up once; this always calls the latest onClose.
  const onDialogClose = useEffectEvent(() => onClose());
  const [error, setError] = useState(null);
  const [imageIndex, setImageIndex] = useState(0);
  const { account } = useAccount();
  const [editingTags, setEditingTags] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myComments, setMyComments] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const [myReports, setMyReports] = useState([]);

  useEffect(() => {
    if (!plot) return;
    fetch(`/api/plots/${plot.id}`)
      .then((res) => res.json())
      .then(setDetail)
      .catch((err) => setError(err.message));
  }, [plot]);

  // Phones: the card is a native modal dialog. The browser keeps focus inside
  // it, closes it on Esc (and on a tap outside, with closedby="any"), and
  // tells screen readers it opened. Closing it closes the card (onClose
  // updates the URL). It's removed rather than closed when the URL changes
  // (e.g. the Back button), so focus is put back on what opened it by hand.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    dialog.showModal();
    // A close event arrives a moment after the close. If the dialog has been
    // reopened since (React re-runs this setup in development), it's stale.
    const handleClose = () => { if (!dialog.open) onDialogClose(); };
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('close', handleClose);
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // Desktop: the card replaces the list, so move focus to its title, or
  // keyboard and screen reader users wouldn't know it opened. Not on a page
  // opened straight from a link: the card is already the page, and the
  // browser would draw a focus ring on the title.
  useEffect(() => {
    if (inline && openedInApp) headingRef.current?.focus({ preventScroll: true });
  }, [inline, openedInApp]);

  if (!plot) return null;

  const shop = detail ? detail.shop : plot.shop;
  const images = shop?.images || [];
  const comments = [...myComments, ...(shop?.comments || [])].filter((c) => !deletedIds.includes(c.id));
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
  const categoryTags = (shop?.tags ?? []).filter((t) => t.kind === 'category');
  const stockTags = (shop?.tags ?? []).filter((t) => t.kind === 'stock');
  // Linked players can edit the shop's tags from the end of the stock tag row:
  // "+" when the shop has tags, "Add tags…" when it has none yet.
  const canEditTags = !!account && !!shop;
  const hasTags = (shop?.tags ?? []).length > 0;
  const editTagsButton = canEditTags ? (
    <button type="button" className="tag-chip--add" onClick={() => setEditingTags(true)} aria-label="Edit tags">
      {hasTags ? '+' : 'Add tags…'}
    </button>
  ) : null;
  const handleTagsSaved = (tags) => {
    setDetail((d) => (d?.shop ? { ...d, shop: { ...d.shop, tags } } : d));
    onReported?.(); // refresh the plot list so search sees the new tags
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setSubmitting(true);
    try {
      // The server returns the saved comment (already approved and linked).
      const saved = await postJson(`/api/plots/${plot.id}/comments`, { body: commentBody.trim() });
      setMyComments((prev) => [saved, ...prev]);
      setCommentBody('');
      setAnnouncement('Comment posted.');
    } catch (err) {
      setError(`Could not submit comment: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReported = (report) => {
    setMyReports((prev) => [report, ...prev]);
    setAnnouncement(`Report sent: ${reportLabel(report)}. Thanks!`);
    onReported?.();
  };

  // The deleted comment had focus; move it to the Comments heading.
  const handleDeleted = (id) => {
    setDeletedIds((ids) => [...ids, id]);
    setAnnouncement('Comment deleted.');
    commentsHeadingRef.current?.focus({ preventScroll: true });
  };

  // Fallback for browsers without closedby: a click on the dialog itself but
  // outside its box landed on the backdrop.
  const handleBackdropClick = (e) => {
    if (SUPPORTS_CLOSEDBY || e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
  };

  // `inline` (desktop): the card sits in the page's right column with a back
  // button. Otherwise (phones): a bottom sheet dialog over the page.
  const content = (
      <>
        {inline ? (
          <button className="plot-detail__back" onClick={onClose}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to list
          </button>
        ) : (
          <button className="plot-detail__close" onClick={onClose} aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
        )}

        <h2 id="plot-detail-title" ref={headingRef} tabIndex={-1}>{displayName(shop)}</h2>
        <p className="visually-hidden" role="status">{announcement}</p>

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
          {categoryTags.length > 0 && (
            <>
              <dt>{categoryTags.length > 1 ? 'Categories' : 'Category'}</dt>
              <dd><TagChips tags={categoryTags} /></dd>
            </>
          )}
          <dt>Plot</dt>
          <dd><span className="coord">{plot.id}</span></dd>
          <dt>Coords</dt>
          <dd><span className="coord">{plot.x}, {plot.z}</span></dd>
          {shop?.palette && (
            <>
              <dt>Palette</dt>
              <dd>{shop.palette}</dd>
            </>
          )}
          <dt>Status</dt>
          <dd className="plot-detail__status">
            {/* A vacant plot has no shop to report on: no history, no report form. */}
            {!shop ? (
              <span>Vacant</span>
            ) : latestReport ? (
              <span>
                {reportLabel(latestReport)}{' '}
                <span className="plot-detail__muted">{timeAgo(latestReport.created_at)}</span>
              </span>
            ) : (
              <span className="plot-detail__muted">No reports yet</span>
            )}
            {shop && reports.length > 1 && (
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
            {shop && <ReportForm plotId={plot.id} onReported={handleReported} />}
          </dd>
          {shop && <ShopText shop={shop} tags={stockTags} after={editTagsButton} />}
        </dl>

        {editingTags && (
          <TagEditor plotId={plot.id} shopTags={shop.tags ?? []} shopText={`${shop.description ?? ''}\n${shop.stock ?? ''}`}
            onClose={() => setEditingTags(false)}
            onSaved={handleTagsSaved} />
        )}

        {error && <p className="plot-detail__error" role="alert">{error}</p>}

        {shop && (
          <>
            <hr />
            <h3 ref={commentsHeadingRef} tabIndex={-1}>Comments</h3>
            {/* <p className="plot-detail__comment-hint">
              Leave a comment if this shop is different from described.
            </p> */}

            {/* Commenting needs a linked account. Nothing shows while that's still loading. */}
            {account === undefined ? null : !account ? (
              <p className="plot-detail__link-prompt">
                <Link to="/account?tab=link">Link your Minecraft account</Link> to comment.
              </p>
            ) : (
              <form className="plot-detail__comment-form" onSubmit={handleSubmitComment}>
                <label htmlFor="plot-detail-comment">
                  Add a comment{' '}
                  <span className="plot-detail__muted">
                    as <strong className="plot-detail__author--linked">{account.name}</strong>
                  </span>
                </label>
                <textarea
                  id="plot-detail-comment"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  required
                />
                <button type="submit" disabled={submitting}>
                  {submitting ? 'Posting…' : 'Post comment'}
                </button>
              </form>
            )}

            <CommentList
              comments={comments}
              interactive
              onDeleted={handleDeleted}
            />
          </>
        )}

        {pastShops.length > 0 && (
          <>
            <hr />
            <h3>Past shops</h3>
            {pastShops.map((s) => <PastShop key={s.id} summary={s} />)}
          </>
        )}
      </>
  );

  if (inline) {
    return (
      <section className="plot-detail__sheet plot-detail__sheet--inline" aria-labelledby="plot-detail-title">
        {content}
      </section>
    );
  }
  return (
    <dialog ref={dialogRef} className="plot-detail__sheet plot-detail__dialog" aria-labelledby="plot-detail-title"
      closedby="any" onClick={handleBackdropClick}>
      {content}
    </dialog>
  );
}

export default PlotDetail;
