import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// The card's screenshots (3.11), at the top of the card, one at a time. Who
// added each one is its caption: it shows on hover, or a tap on phones, so it
// takes no room under the picture. Screen readers always read it. Adding and
// deleting are in the edit view (ShopImages.jsx).
// `images` is null while the card's full page loads; `expected` (the list's
// count) then keeps an empty frame in their place.
function ShopGallery({ images, expected }) {
  const [index, setIndex] = useState(0);
  const [captioned, setCaptioned] = useState(false);

  if (!images) {
    return expected > 0 ? <div className="plot-detail__gallery"><div className="plot-detail__carousel" /></div> : null;
  }
  if (images.length === 0) return null;
  const at = Math.min(index, images.length - 1);
  const current = images[at];

  return (
    <section className="plot-detail__gallery" aria-label="Screenshots">
      <figure className={`plot-detail__carousel${captioned ? ' plot-detail__carousel--captioned' : ''}`}>
        <img src={current.card_url} alt={`Screenshot ${at + 1} of ${images.length}`}
          width={current.width ?? undefined} height={current.height ?? undefined}
          onClick={() => setCaptioned(!captioned)} />
        {current.uploader && <figcaption>By {current.uploader}</figcaption>}
        {images.length > 1 && (
          <>
            <button type="button" className="plot-detail__carousel-nav plot-detail__carousel-nav--prev"
              onClick={() => setIndex((at - 1 + images.length) % images.length)} aria-label="Previous screenshot">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button type="button" className="plot-detail__carousel-nav plot-detail__carousel-nav--next"
              onClick={() => setIndex((at + 1) % images.length)} aria-label="Next screenshot">
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <div className="plot-detail__carousel-count">{at + 1} / {images.length}</div>
          </>
        )}
      </figure>
    </section>
  );
}

export default ShopGallery;
