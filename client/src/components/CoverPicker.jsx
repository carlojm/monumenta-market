import { useRef, useState } from 'react';
import { defaultCrop, moveCrop, resizeCrop, setCover } from '../lib/images';
import CoverImage from './CoverImage';

// Choosing the part of a screenshot the card's cover shows: a banner-shaped
// box over the image, dragged to move it and by its corner to resize it
// (arrow keys and + / - do the same). Pointer capture keeps the drag going
// when the pointer leaves the box, with no listeners to clean up.
function CoverPicker({ plotId, image, initial, onSaved, onCancel }) {
  const [size, setSize] = useState(image.width && image.height ? [image.width, image.height] : null);
  const [crop, setCrop] = useState(() => initial ?? (size ? defaultCrop(...size) : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const frame = useRef(null);
  const drag = useRef(null);

  // Images from before 3.11 have no stored size: read it once it loads.
  const loaded = (e) => {
    if (size) return;
    const natural = [e.currentTarget.naturalWidth, e.currentTarget.naturalHeight];
    setSize(natural);
    setCrop((c) => c ?? defaultCrop(...natural));
  };

  // data-drag says which part was grabbed: the box (move) or its corner (resize).
  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation(); // the corner is inside the box: only one of them starts
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode: e.currentTarget.dataset.drag, x: e.clientX, y: e.clientY, crop };
  };
  const dragging = (e) => {
    const d = drag.current;
    if (!d) return;
    const box = frame.current.getBoundingClientRect();
    const dx = (e.clientX - d.x) / box.width;
    const dy = (e.clientY - d.y) / box.height;
    setCrop(d.mode === 'move' ? moveCrop(d.crop, dx, dy) : resizeCrop(d.crop, d.crop.w + dx, ...size));
  };
  const endDrag = () => { drag.current = null; };

  const keys = (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) setCrop((c) => moveCrop(c, ...moves[e.key]));
    else if (e.key === '+' || e.key === '=') setCrop((c) => resizeCrop(c, c.w + 0.05, ...size));
    else if (e.key === '-') setCrop((c) => resizeCrop(c, c.w - 0.05, ...size));
    else return;
    e.preventDefault();
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await setCover(plotId, image.id, crop);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const pct = (v) => `${v * 100}%`;
  return (
    <div className="cover-picker">
      <h4>Choose the cover</h4>
      <p className="cover-picker__hint">Drag the box to pick what shows, and its corner to resize it.</p>
      <div className="cover-picker__frame" ref={frame} onPointerMove={dragging} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <img src={image.card_url} alt="" onLoad={loaded} draggable={false} />
        {crop && (
          <div className="cover-picker__box" style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
            tabIndex={0} role="group" aria-label="Cover area. Arrow keys move it; plus and minus resize it."
            data-drag="move" onPointerDown={startDrag} onKeyDown={keys}>
            <span className="cover-picker__corner" data-drag="resize" onPointerDown={startDrag} aria-hidden="true" />
          </div>
        )}
      </div>
      {crop && (
        <>
          <p className="cover-picker__hint">Preview</p>
          <CoverImage image={image} crop={crop} />
        </>
      )}
      {error && <p className="plot-detail__error" role="alert">{error}</p>}
      <div className="cover-picker__actions">
        <button type="button" onClick={save} disabled={!crop || saving}>{saving ? 'Saving…' : 'Save cover'}</button>
        <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

export default CoverPicker;
