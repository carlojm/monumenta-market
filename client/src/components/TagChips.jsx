import './TagChips.css';

// A row of tag chips, tinted in each tag's color (its own, or its group's).
// `after` is shown at the end of the row (e.g. the "+" button to edit tags).
function TagChips({ tags, className = '', after = null }) {
  if (!tags?.length && !after) return null;
  return (
    <ul className={`tag-chips ${className}`.trim()}>
      {tags.map((t) => (
        <li
          key={t.id}
          className={`tag-chip${t.color ? '' : ' tag-chip--plain'}`}
          style={t.color ? { '--tag-color': t.color } : undefined}
          title={t.group ? `${t.group}${t.aliases?.length ? `, also: ${t.aliases.join(', ')}` : ''}` : undefined}
        >
          {t.name}
        </li>
      ))}
      {after && <li>{after}</li>}
    </ul>
  );
}

export default TagChips;
