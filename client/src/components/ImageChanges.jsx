import './ImageChanges.css';

// An edit's pictures (3.11), as small previews: screenshots added and
// removed, and the icon's change. `images` is { added, removed } and `icon`
// { from, to } (or null), each image { id, kind, card_url }, as the server
// sends them (imageChanges in server/lib/revisions.js). `fieldClass` and
// `labelClass` match the list it's in, so it lines up with the text changes.

function Pictures({ list, verb, removed = false }) {
  if (!list.length) return null;
  return (
    <div className={`image-changes__row${removed ? ' image-changes__row--removed' : ''}`}>
      <span className="image-changes__verb">{verb}</span>
      {list.map((image) => (
        <img key={image.id} src={image.card_url} alt={`${image.kind === 'icon' ? 'Icon' : 'Screenshot'}, ${verb.toLowerCase()}`}
          className={image.kind === 'icon' ? 'image-changes__icon' : undefined} loading="lazy" />
      ))}
    </div>
  );
}

function ImageChanges({ images, icon, fieldClass, labelClass }) {
  return (
    <>
      {(images?.added.length > 0 || images?.removed.length > 0) && (
        <div className={fieldClass}>
          <span className={labelClass}>Screenshots</span>
          <Pictures list={images.added} verb="Added" />
          <Pictures list={images.removed} verb="Removed" removed />
        </div>
      )}
      {icon && (
        <div className={fieldClass}>
          <span className={labelClass}>Icon</span>
          <Pictures list={icon.to ? [icon.to] : []} verb={icon.from ? 'New' : 'Added'} />
          <Pictures list={icon.from ? [icon.from] : []} verb={icon.to ? 'Old' : 'Removed'} removed />
        </div>
      )}
    </>
  );
}

export default ImageChanges;
