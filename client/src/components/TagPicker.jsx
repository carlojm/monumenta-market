import { useMemo, useState } from 'react';
import './TagChips.css';
import './TagPicker.css';

const tagStyle = (t) => (t.color ? { '--tag-color': t.color } : undefined);
const chipClass = (t, extra = '') => `tag-chip${t.color ? '' : ' tag-chip--plain'} ${extra}`.trim();

// Choosing a shop's tags. `catalog` is GET /api/tags ({ groups, tags } in display
// order); `value` is the selected tag ids. Click a tag to add or remove it; the
// search box matches names and aliases ("white" finds Halls of Wind and Blood).
function TagPicker({ catalog, value, onChange }) {
  const [query, setQuery] = useState('');
  const selected = new Set(value);
  const toggle = (id) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  const q = query.trim().toLowerCase();
  const matches = (t) => !q || [t.name, ...t.aliases].some((term) => term.toLowerCase().includes(q));

  // Sections in display order: categories, then each stock group.
  const sections = useMemo(() => {
    const tags = catalog?.tags ?? [];
    return [
      { name: 'Categories', tags: tags.filter((t) => t.kind === 'category') },
      ...(catalog?.groups ?? []).map((g) => ({ name: g.name, tags: tags.filter((t) => t.kind === 'stock' && t.group === g.name) })),
    ];
  }, [catalog]);

  if (!catalog) return <p className="tag-picker__muted">Loading tags…</p>;
  const chosen = catalog.tags.filter((t) => selected.has(t.id)); // shown in display order
  const visible = sections.map((s) => ({ ...s, tags: s.tags.filter(matches) })).filter((s) => s.tags.length);

  return (
    <div className="tag-picker">
      <div className="tag-picker__chosen">
        {chosen.length ? (
          <ul className="tag-chips">
            {chosen.map((t) => (
              <li key={t.id}>
                <button type="button" className={chipClass(t, 'tag-picker__remove')} style={tagStyle(t)}
                  onClick={() => toggle(t.id)} aria-label={`Remove ${t.name}`}>
                  {t.name} <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span className="tag-picker__muted">No tags yet.</span>
        )}
      </div>

      <input type="text" placeholder="Find a tag (names and aliases)…" value={query}
        onChange={(e) => setQuery(e.target.value)} />

      <div className="tag-picker__sections">
        {visible.length === 0 && <p className="tag-picker__muted">No tags match "{query}".</p>}
        {visible.map((s) => (
          <section key={s.name}>
            <h4>{s.name}</h4>
            <ul className="tag-chips">
              {s.tags.map((t) => (
                <li key={t.id}>
                  <button type="button" className={chipClass(t, 'tag-picker__option')} style={tagStyle(t)}
                    aria-pressed={selected.has(t.id)} onClick={() => toggle(t.id)}
                    title={t.aliases.length ? `Also: ${t.aliases.join(', ')}` : undefined}>
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export default TagPicker;
