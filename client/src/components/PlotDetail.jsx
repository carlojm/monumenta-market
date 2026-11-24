import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, X } from 'lucide-react';
import './PlotDetail.css';
import { useAccount } from '../lib/account';
import { plotDetailResource, useResource } from '../lib/resource';
import TagChips from './TagChips';
import PendingEdits from './PendingEdits';
import ShopEditForm from './ShopEditForm';
import ShopHistory from './ShopHistory';
import StarButton from './StarButton';
import { useFavorites } from '../lib/favorites';
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
  // The button's ref callback does it when the button comes back.
  const refocusDelete = useRef(false);
  const deleteButtonMounted = (el) => {
    if (el && refocusDelete.current) {
      refocusDelete.current = false;
      el.focus();
    }
  };
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
              <button type="button" ref={deleteButtonMounted} onClick={() => setConfirmingDelete(true)}>Delete</button>
            )}
          </div>
        )
      )}
      {error && <p className="plot-detail__error" role="alert">{error}</p>}
    </li>
  );
}

// The phone card while no plot is open: nothing to load. `get` returns the
// same object every time, as useSyncExternalStore requires.
const NOTHING = { data: null, error: null };
const NO_DETAIL = { subscribe: () => () => {}, get: () => NOTHING };

// Left/Right, Home/End move focus between the tabs (Enter or a click selects).
function moveBetweenTabs(e) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]')];
  const at = tabs.indexOf(document.activeElement);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1
    : (at + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus();
}

// A tab panel that isn't selected is hidden="until-found": hidden, but Find in
// page still searches it, and reveals it (firing `beforematch`) on a match.
// React only renders `hidden` as on or off, so a ref callback sets it.
// Returns the cleanup, for a ref callback.
function hideUntilFound(el, hidden, onReveal) {
  if (!el) return undefined;
  if (hidden) el.setAttribute('hidden', 'until-found');
  else el.removeAttribute('hidden');
  el.addEventListener('beforematch', onReveal);
  return () => el.removeEventListener('beforematch', onReveal);
}

// Players' comments. The automatic Update lines (is_system) aren't listed
// here: History has the changes (3.9).
function CommentList({ comments: all, interactive = false, onDeleted }) {
  const comments = all.filter((c) => !c.is_system);
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
// under Keywords.
function ShopText({ shop, tags }) {
  const showKeywords = shop.stock || tags.length > 0;
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
            <TagChips tags={tags} className="plot-detail__stock-tags" />
          </dd>
        </>
      )}
    </>
  );
}

// Earlier shops on this plot, in the History tab (3.9).
function PastShops({ shops }) {
  if (!shops.length) return null;
  return (
    <section className="plot-detail__past-shops" aria-labelledby="plot-detail-past-shops">
      <h4 id="plot-detail-past-shops">Earlier shops on this plot</h4>
      {shops.map((s) => <PastShop key={s.id} summary={s} />)}
    </section>
  );
}

// A past shop, loaded the first time it's expanded: who ran it (when its
// name isn't the owner's), what it said, and its comments, folded.
function PastShop({ summary }) {
  const [shop, setShop] = useState(null);
  const load = (e) => {
    if (!e.currentTarget.open || shop) return;
    fetch(`/api/shops/${summary.id}`).then((res) => res.json()).then(setShop);
  };
  const comments = shop?.comments.filter((c) => !c.is_system) ?? [];
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
          <dl className="plot-detail__meta">
            {displayName(shop) !== shop.owner && (
              <>
                <dt>{shop.guild_name ? 'Guild' : 'Owner'}</dt>
                <dd>{ownerLabel(shop)}</dd>
              </>
            )}
            <ShopText shop={shop} tags={shop.tags} />
            {shop.palette && (
              <>
                <dt>Palette</dt>
                <dd>{shop.palette}</dd>
              </>
            )}
          </dl>
          {comments.length > 0 && (
            <details className="plot-detail__past-comments">
              <summary>Comments ({comments.length})</summary>
              <CommentList comments={comments} />
            </details>
          )}
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

function PlotDetail({ plot, plots = [], catalog = null, onClose, onReported, inline = false, openedInApp = false }) {
  // The plot's details (comments, reports, pending edits, past shops). The
  // card shows right away from the map's data and fills in when they arrive
  // (lib/resource.js). The phone card is mounted with no plot while closed.
  const detailResource = plot ? plotDetailResource(plot.id) : NO_DETAIL;
  const { data: detail, error: loadError } = useResource(detailResource);
  const starred = useFavorites();
  // Phones: the card is a native modal dialog. The browser keeps focus inside
  // it, closes it on Esc (and on a tap outside, with closedby="any"), and
  // tells screen readers it opened. Closing it closes the card (onClose
  // updates the URL). It's removed rather than closed when the URL changes
  // (e.g. the Back button), so focus is put back on what opened it by hand.
  // A ref callback: it runs when the dialog appears; its cleanup, when it goes.
  const dialogMounted = useCallback((dialog) => {
    if (!dialog) return undefined;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  // Desktop: the card replaces the list, so focus moves to its title, or
  // keyboard and screen reader users wouldn't know it opened. Not on a page
  // opened straight from a link: the card is already the page, and the
  // browser would draw a focus ring on the title. Stable, so it runs only
  // when the title first appears.
  const headingMounted = useCallback((el) => {
    if (el && inline && openedInApp) el.focus({ preventScroll: true });
  }, [inline, openedInApp]);
  const commentsTabRef = useRef(null);
  // The Comments / History tabs at the bottom of the card. History mounts
  // (and loads) the first time it's opened.
  const [tab, setTab] = useState('comments');
  const [historyOpened, setHistoryOpened] = useState(false);
  // Goes up each time the card reloads after a change, so History loads again.
  const [reloads, setReloads] = useState(0);
  const showTab = (name) => {
    setTab(name);
    if (name === 'history') setHistoryOpened(true);
  };
  // The panels: the other tab's is hidden until found; if Find in page
  // reveals it, its tab is selected to match. Rerun when the tab changes.
  const commentsPanel = useCallback((el) => hideUntilFound(el, tab !== 'comments', () => setTab('comments')), [tab]);
  const historyPanel = useCallback((el) => hideUntilFound(el, tab !== 'history', () => {
    setTab('history');
    setHistoryOpened(true);
  }), [tab]);
  // Read out by screen readers (visually hidden): "Report sent", etc.
  const [announcement, setAnnouncement] = useState('');
  const [error, setError] = useState(null);
  const [imageIndex, setImageIndex] = useState(0);
  const { account } = useAccount();
  // Editing the shop (ShopEditForm). `editDirty`: it has unsaved changes, so
  // closing the card asks first (`confirmingClose`). `notice`: what happened to
  // the last edit, shown at the top of the card.
  const [editing, setEditing] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const editButtonRef = useRef(null);
  // Esc or a tap outside with unsaved edits asks first. (Browsers may skip
  // this when the page hasn't been interacted with since the last time.)
  const handleDialogCancel = (e) => {
    if (!(editing && editDirty)) return;
    e.preventDefault();
    setConfirmingClose(true);
  };
  // A close event arrives a moment after the close. If the dialog has been
  // opened again since (React mounts it twice in development), it's stale.
  const handleDialogClose = (e) => {
    if (!e.currentTarget.open) onClose();
  };
  // Back on the card, focus returns to the Edit button. It's only rendered
  // again after the form closes, so its ref callback does the focusing.
  const refocusEdit = useRef(false);
  const editButtonMounted = (el) => {
    editButtonRef.current = el;
    if (el && refocusEdit.current) {
      refocusEdit.current = false;
      el.focus();
    }
  };

  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myComments, setMyComments] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const [myReports, setMyReports] = useState([]);



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
  // Closing with unsaved edits asks first.
  const requestClose = () => (editing && editDirty ? setConfirmingClose(true) : onClose());

  // Logged-out visitors get a prompt to link their account instead.
  const startEditing = () => {
    if (!account) return setShowLinkPrompt(true);
    setNotice(null);
    setEditing(true);
  };

  const stopEditing = () => {
    setEditing(false);
    setEditDirty(false);
    setConfirmingClose(false);
  };

  const handleEditCancelled = () => {
    refocusEdit.current = true;
    stopEditing();
  };

  // Loads the page again after a change. Comments and reports added here
  // come back with it. The plot list is refreshed too, so search sees it.
  const reload = () => {
    detailResource.refresh().then(() => {
      setMyComments([]);
      setMyReports([]);
      setReloads((n) => n + 1);
    });
    onReported?.();
  };

  const handleEditDone = (result) => {
    refocusEdit.current = true;
    stopEditing();
    setNotice(result);
    if (result.status === 'approved') {
      setAnnouncement('Edit saved.');
      reload();
    } else {
      setAnnouncement('Edit sent for review.');
      reload(); // it shows up under "waiting for review"
    }
  };

  // Right after a Force edit: put the page back. Focus goes to Edit, since
  // the Undo button goes away.
  const undo = async () => {
    try {
      await postJson(`/api/revisions/${notice.id}/undo`, {});
      setNotice({ status: 'undone' });
      setAnnouncement('Edit undone.');
      reload();
      editButtonRef.current?.focus();
    } catch (err) {
      setNotice({ ...notice, error: err.message });
      reload(); // most likely the page changed since: show it as it is now
      editButtonRef.current?.focus();
    }
  };

  // Approved or rejected from the pending list (owners and mods). The page
  // reloads to show the change; focus goes to Edit, as the buttons are gone.
  const handleReviewed = (outcome) => {
    // Not 'approved': that's your own Force edit, with Undo.
    setNotice({ status: outcome === 'approved' ? 'accepted' : 'rejected' });
    setAnnouncement(outcome === 'approved' ? 'Edit approved.' : 'Edit rejected.');
    reload();
    editButtonRef.current?.focus();
  };

  // From the pending list. The button goes away, so focus goes to Edit.
  const withdraw = async (id) => {
    try {
      await postJson(`/api/revisions/${id}/withdraw`, {});
      setNotice({ status: 'withdrawn' });
      setAnnouncement('Suggestion withdrawn.');
      reload();
    } catch (err) {
      setNotice({ status: 'withdrawn', error: err.message });
    }
    editButtonRef.current?.focus();
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

  // The deleted comment had focus; move it to the Comments tab.
  const handleDeleted = (id) => {
    setDeletedIds((ids) => [...ids, id]);
    setAnnouncement('Comment deleted.');
    commentsTabRef.current?.focus({ preventScroll: true });
  };

  // Fallback for browsers without closedby: a click on the dialog itself but
  // outside its box landed on the backdrop.
  const handleBackdropClick = (e) => {
    if (SUPPORTS_CLOSEDBY || e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) requestClose();
  };

  // `inline` (desktop): the card sits in the page's right column with a back
  // button. Otherwise (phones): a bottom sheet dialog over the page.
  const content = (
      <>
        {inline && (
          <button className="plot-detail__back" onClick={requestClose}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to list
          </button>
        )}

        {/* The name, then its buttons in one row of same-size icons: star,
            edit, and close on phones. */}
        <div className="plot-detail__header">
          <h2 id="plot-detail-title" ref={headingMounted} tabIndex={-1}>{displayName(shop)}</h2>
          <div className="plot-detail__actions">
            {shop && <StarButton plotId={plot.id} name={displayName(shop)} starred={starred.has(plot.id)} />}
            {/* Shown once the full page has loaded: an edit starts from it.
                A vacant plot's form starts at "A new shop is here"; it's the
                only button there, so it keeps its words. */}
            {detail && account !== undefined && !editing && (shop ? (
              <button type="button" className="plot-detail__icon-button" ref={editButtonMounted} onClick={startEditing}
                aria-label="Edit" title="Edit">
                <Pencil size={16} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="plot-detail__add-shop" ref={editButtonMounted} onClick={startEditing}>
                <Plus size={14} aria-hidden="true" /> Add shop
              </button>
            ))}
            {!inline && (
              <button type="button" className="plot-detail__icon-button" onClick={requestClose} aria-label="Close" title="Close">
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <p className="visually-hidden" role="status">{announcement}</p>

        {showLinkPrompt && !account && (
          <p className="plot-detail__link-prompt">
            <Link to="/account?tab=link">Link your Minecraft account</Link> to edit.
          </p>
        )}

        {confirmingClose && (
          <div className="plot-detail__notice">
            <span>Discard your unsaved edit?</span>
            <div className="plot-detail__notice-actions">
              <button type="button" onClick={onClose}>Discard</button>
              {/* Focus starts on the safe choice. */}
              <button type="button" autoFocus onClick={() => setConfirmingClose(false)}>Keep editing</button>
            </div>
          </div>
        )}

        {notice && (
          <div className="plot-detail__notice">
            {notice.status === 'pending' ? (
              <span>
                Sent for review.
                {notice.replaced > 0 && ' It replaces your earlier suggestion.'}
              </span>
            ) : notice.status === 'approved' ? (
              <>
                <span>Edit saved.</span>
                {/* Gone once undo turns out to be impossible (the page changed since). */}
                {!notice.error && (
                  <div className="plot-detail__notice-actions">
                    <button type="button" onClick={undo}>Undo</button>
                  </div>
                )}
              </>
            ) : notice.status === 'undone' ? (
              <span>Edit undone.</span>
            ) : notice.status === 'accepted' ? (
              <span>Edit approved.</span>
            ) : notice.status === 'rejected' ? (
              <span>Edit rejected.</span>
            ) : (
              <span>{notice.error ? 'Could not withdraw it.' : 'Suggestion withdrawn.'}</span>
            )}
            {notice.error && <p className="plot-detail__error" role="alert">{notice.error}</p>}
          </div>
        )}

        {!editing && detail?.pending_edits && (
          <PendingEdits edits={detail.pending_edits} catalog={catalog} shopTags={shop?.tags ?? []} onWithdraw={withdraw}
            onReviewed={handleReviewed} />
        )}

        {editing ? (
          <ShopEditForm plot={plot} plots={plots} shop={shop} account={account} catalog={catalog} onDone={handleEditDone}
            onCancel={handleEditCancelled} onDirtyChange={setEditDirty} />
        ) : (
          <>

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
            {shop?.maintainers && (
              <>
                <dt>Maintainers</dt>
                <dd>{shop.maintainers}</dd>
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
            {shop && <ShopText shop={shop} tags={stockTags} />}
          </dl>

          {(error || loadError) && <p className="plot-detail__error" role="alert">{error || loadError}</p>}

          {shop ? (
            <>
              <hr />
              {/* Tabs (Modern Web Guidance): selection on activation, since
                  History loads when opened; arrow keys move between them. */}
              <div className="plot-detail__tabs" role="tablist" aria-label="Comments and history" onKeyDown={moveBetweenTabs}>
                <button type="button" role="tab" id="plot-detail-tab-comments" ref={commentsTabRef}
                  aria-selected={tab === 'comments'} tabIndex={tab === 'comments' ? 0 : -1} onClick={() => showTab('comments')}>
                  Comments
                </button>
                <button type="button" role="tab" id="plot-detail-tab-history"
                  aria-selected={tab === 'history'} tabIndex={tab === 'history' ? 0 : -1} onClick={() => showTab('history')}>
                  History
                </button>
              </div>
              <div role="tabpanel" aria-labelledby="plot-detail-tab-comments" className="plot-detail__tabpanel"
                ref={commentsPanel}>
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
              </div>
              <div role="tabpanel" aria-labelledby="plot-detail-tab-history" className="plot-detail__tabpanel"
                ref={historyPanel}>
                {historyOpened && <ShopHistory key={reloads} plotId={plot.id} shop={shop} account={account} onRestored={handleEditDone} />}
                <PastShops shops={pastShops} />
              </div>
            </>
          ) : (
            <>
              <hr />
              <h3>History</h3>
              <ShopHistory key={reloads} plotId={plot.id} />
              <PastShops shops={pastShops} />
            </>
          )}

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
    <dialog ref={dialogMounted} className="plot-detail__sheet plot-detail__dialog" aria-labelledby="plot-detail-title"
      closedby="any" onClick={handleBackdropClick} onCancel={handleDialogCancel} onClose={handleDialogClose}>
      {content}
    </dialog>
  );
}

export default PlotDetail;
