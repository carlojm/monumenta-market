import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// The banner at the top of every card (3.11). With screenshots: one at a time,
// filling the banner; a tap opens it whole, full size, in a viewer. Without:
// a plain band in the shop's color, so every card has the same shape. Adding
// and deleting are in the edit view (ShopImages.jsx).
// `images` is null while the card's full page loads; `expected` (the list's
// count) then keeps an empty frame in their place. `color`: a hex color or null.
function ShopGallery({ images, expected, color }) {
  const [index, setIndex] = useState(0);
  const viewerRef = useRef(null);

  if (!images && expected > 0) {
    return <div className="plot-detail__gallery"><div className="plot-detail__carousel" /></div>;
  }
  if (!images?.length) {
    return <div className="plot-detail__gallery plot-detail__banner" style={color ? { '--banner': color } : undefined} />;
  }
  const at = Math.min(index, images.length - 1);
  const current = images[at];
  const step = (by) => setIndex((at + by + images.length) % images.length);

  const arrows = images.length > 1 && (
    <>
      <button type="button" className="plot-detail__carousel-nav plot-detail__carousel-nav--prev"
        onClick={() => step(-1)} aria-label="Previous screenshot">
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <button type="button" className="plot-detail__carousel-nav plot-detail__carousel-nav--next"
        onClick={() => step(1)} aria-label="Next screenshot">
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </>
  );
  // Who added it (on hover in the banner, always in the viewer), then "1 / 3".
  // Screen readers always read it.
  const caption = (
    <figcaption>
      {current.uploader && <span className="plot-detail__carousel-by">By {current.uploader}</span>}
      {images.length > 1 && <span className="plot-detail__carousel-count">{at + 1} / {images.length}</span>}
    </figcaption>
  );

  // The viewer's own close and cancel events stop here: React passes them up
  // to the card's dialog, which would close the card too.
  const stop = (e) => e.stopPropagation();

  return (
    <section className="plot-detail__gallery" aria-label="Screenshots">
      <figure className="plot-detail__carousel">
        <button type="button" className="plot-detail__carousel-open" onClick={() => viewerRef.current.showModal()}
          aria-label={`Screenshot ${at + 1} of ${images.length}, open full size`}>
          <img src={current.card_url} alt="" width={current.width ?? undefined} height={current.height ?? undefined} />
        </button>
        {arrows}
        {caption}
      </figure>

      {/* A click outside the picture closes it (closedby, with a fallback for
          browsers without it). Arrow keys move between screenshots. */}
      <dialog ref={viewerRef} className="shop-viewer" aria-label="Screenshot, full size" closedby="any"
        onClose={stop} onCancel={stop}
        onClick={(e) => { if (e.target === e.currentTarget) viewerRef.current.close(); }}
        onKeyDown={(e) => {
          if (images.length < 2) return;
          if (e.key === 'ArrowLeft') step(-1);
          if (e.key === 'ArrowRight') step(1);
        }}>
        <figure className="plot-detail__carousel shop-viewer__frame">
          {/* lazy: the full size file loads only once the viewer opens. */}
          <img src={current.url} alt={`Screenshot ${at + 1} of ${images.length}`} loading="lazy"
            width={current.width ?? undefined} height={current.height ?? undefined} />
          {arrows}
          {caption}
        </figure>
        <button type="button" className="plot-detail__icon-button shop-viewer__close"
          onClick={() => viewerRef.current.close()} aria-label="Close screenshot">
          <X size={18} aria-hidden="true" />
        </button>
      </dialog>
    </section>
  );
}

export default ShopGallery;
