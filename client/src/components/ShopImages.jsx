import { useRef, useState } from 'react';
import { MAX_UPLOAD_MB, approveImage, deleteImage, isStaff, managesImages, rejectImage, uploadImage } from '../lib/images';
import './ShopImages.css';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Managing the card's screenshots (3.11), in the edit view under the form.
// The shop's owner, maintainers and staff add and delete, and see the ones
// waiting for a moderator; moderators approve and reject. Each change saves
// at once: the form's Save is for the shop's details only.
// `onChanged(message)` reloads the card and announces what happened.
function ShopImages({ plotId, shop, account, onChanged }) {
  const images = shop.images ?? [];
  const pending = shop.pending_images ?? [];
  const reviews = isStaff(account);
  const [confirmingDelete, setConfirmingDelete] = useState(null); // the screenshot's id
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const headingRef = useRef(null);

  if (!managesImages(account, shop)) return null;

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
    setConfirmingDelete(null);
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
      onChanged([live && `${count(live, 'screenshot')} added.`, waiting && `${count(waiting, 'screenshot')} sent for review.`]
        .filter(Boolean).join(' '));
    }
  };

  return (
    <section className="shop-images" aria-labelledby="shop-images-heading">
      <h3 id="shop-images-heading" ref={headingRef} tabIndex={-1}>Screenshots</h3>

      {images.length > 0 && (
        <ul className="shop-images__list" aria-label="On the card">
          {images.map((image, i) => (
            <li key={image.id}>
              <img src={image.card_url} alt={`Screenshot ${i + 1}`} />
              <div>
                {image.uploader && <p className="shop-images__muted">By {image.uploader}</p>}
                {confirmingDelete === image.id ? (
                  <span className="shop-images__actions">
                    Delete this screenshot?
                    <button type="button" onClick={() => run(() => deleteImage(image.id), 'Screenshot deleted.')} disabled={busy}>
                      Delete
                    </button>
                    <button type="button" autoFocus onClick={() => setConfirmingDelete(null)}>Keep</button>
                  </span>
                ) : (
                  <span className="shop-images__actions">
                    <button type="button" onClick={() => setConfirmingDelete(image.id)} disabled={busy}
                      aria-label={`Delete screenshot ${i + 1}`}>Delete</button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending.length > 0 && (
        <ul className="shop-images__list" aria-label="Waiting for review">
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

      <div className="shop-images__form">
        <ul>
          <li>Images are displayed in a gallery on this card</li>
          <li>ONLY in-game screenshots or in-game screenshots with extra info/text edited onto them</li>
          {/* A moderator's own uploads show at once. */}
          {!reviews && <li>Images must be approved by a moderator before being shown</li>}
          <li>PNG, JPEG, WebP or GIF. Up to {MAX_UPLOAD_MB} MB and at least 640 × 360 (1920 × 1080 looks best)</li>
        </ul>
        <label className="shop-images__file">
          {busy ? 'Uploading…' : 'Add screenshots'}
          <input type="file" accept={ACCEPT} multiple onChange={upload} disabled={busy} />
        </label>
      </div>

      {error && <p className="plot-detail__error" role="alert">{error}</p>}
    </section>
  );
}

export default ShopImages;
