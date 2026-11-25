import DiffText from './DiffText';
import ImageChanges from './ImageChanges';
import { SHOP_FIELDS, hasImageChanges, labelOf } from '../lib/shopFields';
import './RevisionChanges.css';

// How a clash in a field was settled. 'mine' is the edit's own version.
function keptLabel(kind, kept) {
  if (kept === 'current') return 'kept the current version';
  if (kept === 'edited') return 'blended both versions';
  return kind === 'approve' ? 'kept the suggested version' : 'kept their version';
}

// "Show changes" for one page revision (the Mod log and Your edits), folded
// in a native <details> so Find in page still reaches the text. Each field
// that changed as a word diff, with how a clash was settled (`d.resolved`)
// and text changed while approving (`d.edited`: { field, suggested }).
// `kind` is the mod log's ('approve', 'publish', …); `fixedLabel` names an
// edited field.
function RevisionChanges({ kind, d, fixedLabel = 'fixed while approving' }) {
  const changes = d.changes ?? [];
  const fields = SHOP_FIELDS.filter((f) => [changes, d.resolved ?? [], d.edited ?? []].some((list) => list.some((x) => x.field === f)));
  const tags = d.tags && (d.tags.added.length > 0 || d.tags.removed.length > 0) ? d.tags : null;
  if (!fields.length && !tags && !hasImageChanges(d)) return null;
  return (
    <details className="revision-changes">
      <summary>Show changes</summary>
      <div className="revision-changes__list">
        {fields.map((f) => {
          const change = changes.find((c) => c.field === f);
          const resolved = d.resolved?.find((x) => x.field === f);
          const edited = d.edited?.find((x) => x.field === f);
          const note = resolved ? keptLabel(kind, resolved.kept) : edited ? fixedLabel : null;
          return (
            <div className="revision-changes__field" key={f}>
              <span className="revision-changes__label">
                {labelOf(f)}{note && <span className="revision-changes__muted"> {note}</span>}
              </span>
              {change && <DiffText before={change.from} after={change.to} />}
              {edited && (
                <p className="revision-changes__suggested">
                  <span className="revision-changes__muted">Suggested:</span> {edited.suggested ?? '(empty)'}
                </p>
              )}
            </div>
          );
        })}
        {tags && (
          <div className="revision-changes__field">
            <span className="revision-changes__label">Tags</span>
            {tags.added.length > 0 && <p className="diff-text">Added <ins>{tags.added.join(', ')}</ins></p>}
            {tags.removed.length > 0 && <p className="diff-text">Removed <del>{tags.removed.join(', ')}</del></p>}
          </div>
        )}
        <ImageChanges images={d.images} icon={d.icon} fieldClass="revision-changes__field" labelClass="revision-changes__label" />
      </div>
    </details>
  );
}

export default RevisionChanges;
