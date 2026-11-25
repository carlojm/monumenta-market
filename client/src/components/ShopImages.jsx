import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus } from 'lucide-react';
import { MAX_UPLOAD_MB, approveImage, deleteImage, isStaff, managesImages, rejectImage, uploadImage } from '../lib/images';
import './ShopImages.css';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The card's screenshots (3.11), at the top of the card: the approved ones in
// a carousel. The shop's owner, maintainers and staff also add more, see the
// ones waiting for a moderator and delete; moderators approve and reject.
// The heading is for screen readers (and focus after an action); on screen
// the pictures speak for themselves.
// `onChanged(message)` reloads the card and announces what happened.
function ShopImages({ plotId, shop, account, onChanged }) {
  const images = shop.images ?? [];
  const pending = shop.pending_images ?? [];
  const manages = managesImages(account, shop);
  const reviews = isStaff(account);
  const [index, setIndex] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const headingRef = useRef(null);

  if (!manages && images.length === 0) return null;

  const at = Math.min(index, images.length - 1);
  const current = images[at];

  // Runs an action; a failure shows here, success reloads the card. Focus
  // goes to the heading, since the button pressed is often gone afterwards.
  const run = async (action, message) => {
    setBusy(true);
    setError('');
    try {
      await action();
      onChanged(message);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
    setConfirmingDelete(false);
    headingRef.current?.focus();
  };

  const upload = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError('');
    let live = 0;
    let waiting = 0;
    const failed = [];
    for (const file of files) {
      try {
        const image = await uploadImage(plotId, file);
        if (image.status === 'pending') waiting++;
        else live++;
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
      }
    }
    setBusy(false);
    if (failed.length) setError(failed.join(' '));
    if (live || waiting) {
      setAdding(false);
      onChanged([live && `${count(live, 'screenshot')} added.`, waiting && `${count(waiting, 'screenshot')} sent for review.`]
        .filter(Boolean).join(' '));
    }
  };

  return (
    <section className="shop-images" aria-labelledby="shop-images-heading">
      <h3 id="shop-images-heading" className="visually-hidden" ref={headingRef} tabIndex={-1}>Screenshots</h3>

      {current && (
        <>
          <div className="plot-detail__carousel">
            <img src={current.card_url} alt={`Screenshot ${at + 1} of ${images.length}`}
              width={current.width ?? undefined} height={current.height ?? undefined} />
            {images.length > 1 && (
              <>
                <button type="button" className="plot-detail__carousel-nav plot-detail__carousel-nav--prev"
                  onClick={() => { setIndex((at - 1 + images.length) % images.length); setConfirmingDelete(false); }}
                  aria-label="Previous screenshot">
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <button type="button" className="plot-detail__carousel-nav plot-detail__carousel-nav--next"
                  onClick={() => { setIndex((at + 1) % images.length); setConfirmingDelete(false); }}
                  aria-label="Next screenshot">
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
                <div className="plot-detail__carousel-count">{at + 1} / {images.length}</div>
              </>
            )}
          </div>
          <div className="shop-images__about">
            <span className="shop-images__muted">{current.uploader && `By ${current.uploader}`}</span>
            {manages && !confirmingDelete && (
              <span className="shop-images__actions">
                <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy}>Delete</button>
              </span>
            )}
            {confirmingDelete && (
              <span className="shop-images__actions">
                Delete this screenshot?
                <button type="button" onClick={() => run(() => deleteImage(current.id), 'Screenshot deleted.')} disabled={busy}>
                  Delete
                </button>
                <button type="button" autoFocus onClick={() => setConfirmingDelete(false)}>Keep</button>
              </span>
            )}
          </div>
        </>
      )}

      {pending.length > 0 && (
        <ul className="shop-images__pending" aria-label="Waiting for review">
          {pending.map((image) => (
            <li key={image.id}>
              <img src={image.card_url} alt="" className={image.kind === 'icon' ? 'shop-images__icon' : undefined} />
              <div>
                <p>
                  {image.kind === 'icon' ? 'Icon' : 'Screenshot'}
                  {image.uploader ? ` from ${image.uploader}` : ''}, waiting for review
                </p>
                <span className="shop-images__actions">
                  {reviews ? (
                    <>
                      <button type="button" disabled={busy}
                        onClick={() => run(() => approveImage(image.id), 'Approved.')}>Approve</button>
                      <button type="button" disabled={busy}
                        onClick={() => run(() => rejectImage(image.id), 'Rejected.')}>Reject</button>
                    </>
                  ) : image.uploader === account?.name && (
                    <button type="button" disabled={busy}
                      onClick={() => run(() => deleteImage(image.id), 'Withdrawn.')}>Withdraw</button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {manages && (
        <>
          <button type="button" className="shop-images__add" aria-expanded={adding} onClick={() => setAdding(!adding)}>
            <ImagePlus size={16} aria-hidden="true" /> Add screenshots
          </button>
          {adding && (
            <div className="shop-images__form">
              <ul>
                <li>Images are displayed in a gallery on this card</li>
                <li>ONLY in-game screenshots or in-game screenshots with extra info/text edited onto them</li>
                {/* A moderator's own uploads show at once. */}
                {!reviews && <li>Images must be approved by a moderator before being shown</li>}
                <li>PNG, JPEG, WebP or GIF. Up to {MAX_UPLOAD_MB} MB and at least 640 × 360 (1920 × 1080 looks best)</li>
              </ul>
              <label className="shop-images__file">
                {busy ? 'Uploading…' : 'Choose screenshots'}
                <input type="file" accept={ACCEPT} multiple onChange={upload} disabled={busy} />
              </label>
            </div>
          )}
        </>
      )}

      {error && <p className="plot-detail__error" role="alert">{error}</p>}
    </section>
  );
}

export default ShopImages;
