import { coverStyle } from '../lib/images';

// The card's cover: the chosen part of a screenshot, as a banner. Decorative
// (alt=""): the same screenshot is in the gallery below with its own text.
function CoverImage({ image, crop }) {
  return (
    <div className="cover-image">
      <img src={image.card_url} alt="" style={coverStyle(crop)} draggable={false} />
    </div>
  );
}

export default CoverImage;
