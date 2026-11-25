import { useState } from 'react';
import { MAX_UPLOAD_MB, uploadImage } from '../lib/images';
import './ShopImages.css';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The shop's icon and screenshots (3.11), as part of the edit form
// (ShopEditForm.jsx), for the shop's owner, maintainers and staff. A chosen
// file uploads at once as the uploader's draft, so its preview and any
// problem show right away; it reaches the card only when the edit is sent.
// `images` and `icon` are the edit's (image objects); `onAdd(kind, images)`
// (all of one pick's uploads, once they're done) and `onRemove(kind, image)`
// change them. `iconLabel` and `screenshotsLabel`
// are the form's label rows (with "Edited" and undo); `children` (the banner
// color) shows while there are no screenshots, as the card then shows it.
function ShopImages({ plotId, images, icon, staff, onAdd, onRemove, iconLabel, screenshotsLabel, children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  // `kind`: 'gallery' or 'icon'.
  const upload = (kind) => async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError('');
    const failed = [];
    const added = [];
    for (const file of files) {
      try {
        added.push(await uploadImage(plotId, file, kind));
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
      }
    }
    setBusy(false);
    setError(failed.join(' '));
    if (!added.length) return;
    onAdd(kind, added);
    setStatus(kind === 'icon' ? 'Icon added to your edit.' : `${count(added.length, 'screenshot')} added to your edit.`);
  };

  const remove = (kind, image, label) => {
    onRemove(kind, image);
    setStatus(`${label} removed from your edit.`);
  };

  const reviewNote = !staff && <li>Images must be approved by a moderator before being shown</li>;

  return (
    <div className="shop-images">
      <div className="shop-edit__field" role="group" aria-labelledby="shop-images-icon-label">
        {iconLabel}
        {icon && (
          <div className="shop-images__current">
            <img src={icon.card_url ?? icon.url} alt="The shop's icon" className="shop-images__icon" />
            <span className="shop-images__actions">
              <button type="button" onClick={() => remove('icon', icon, 'Icon')} disabled={busy}>Remove</button>
            </span>
          </div>
        )}
        <div className="shop-images__form">
          <ul>
            <li>Shown next to the shop&apos;s name in the list</li>
            <li>Must be some kind of icon representing your shop</li>
            {reviewNote}
            <li>PNG, JPEG, WebP or GIF, at least 16 × 16 (an item&apos;s texture works). Other shapes are cut to a square from the middle</li>
          </ul>
          <label className="shop-images__file">
            {busy ? 'Uploading…' : icon ? 'Replace icon' : 'Add icon'}
            <input type="file" accept={ACCEPT} onChange={upload('icon')} disabled={busy} />
          </label>
        </div>
      </div>

      <div className="shop-edit__field" role="group" aria-labelledby="shop-images-screenshots-label">
        {screenshotsLabel}
        {images.length > 0 && (
          <ul className="shop-images__list" aria-label="Screenshots in your edit">
            {images.map((image, i) => (
              <li key={image.id}>
                <img src={image.card_url} alt={`Screenshot ${i + 1}`} />
                <span className="shop-images__actions">
                  <button type="button" onClick={() => remove('gallery', image, `Screenshot ${i + 1}`)} disabled={busy}
                    aria-label={`Remove screenshot ${i + 1}`}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="shop-images__form">
          <ul>
            <li>Images are displayed in a gallery on this card</li>
            <li>ONLY in-game screenshots or in-game screenshots with extra info/text edited onto them</li>
            {reviewNote}
            <li>PNG, JPEG, WebP or GIF. Up to {MAX_UPLOAD_MB} MB and at least 640 × 360 (1920 × 1080 looks best)</li>
          </ul>
          <label className="shop-images__file">
            {busy ? 'Uploading…' : 'Add screenshots'}
            <input type="file" accept={ACCEPT} multiple onChange={upload('gallery')} disabled={busy} />
          </label>
        </div>
      </div>

      {images.length === 0 && children}

      <p className="visually-hidden" aria-live="polite">{status}</p>
      {error && <p className="shop-edit__error" role="alert">{error}</p>}
    </div>
  );
}

export default ShopImages;
