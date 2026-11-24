import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminFetch } from '../lib/adminAuth';
import { displayName } from '../lib/plots';
import { matchTags } from '../lib/tagSuggestions';
import { plotsResource, tagsResource, useResource } from '../lib/resource';
import '../components/TagChips.css';

// Admin → Tags: tag many shops at once from their description and stock text,
// using the same matching as the Edit tags popup. Confident matches (the tag's
// name or a long alias) start ticked; short aliases ("MR") start unticked.
// Applying only adds tags.

const CONFIDENT = 2;

function proposalsFor(plots, catalog) {
  return plots
    .filter((p) => p.shop)
    .map((p) => {
      const text = `${p.shop.description ?? ''}\n${p.shop.stock ?? ''}`;
      const matches = matchTags(text, catalog.tags, (p.shop.tags ?? []).map((t) => t.id));
      return { plot: p, text, matches };
    })
    .filter((p) => p.matches.length > 0);
}

const initialTicks = (proposals) => Object.fromEntries(proposals.map((p) => [
  p.plot.id, p.matches.filter((m) => m.score >= CONFIDENT).map((m) => m.tag.id),
]));

function AdminAutoTag() {
  // The shared plot and tag lists (lib/resource.js), loaded when this opens.
  const plots = useResource(plotsResource);
  const catalog = useResource(tagsResource);
  // plot id -> tag ids. Until you change one, the confident matches are
  // ticked (null). After adding, what's left was unticked on purpose (or is a
  // short alias), so it all starts unticked ({}).
  const [picked, setPicked] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const loaded = plots.data.length > 0 && catalog.data;
  const proposals = useMemo(() => (loaded ? proposalsFor(plots.data, catalog.data) : []), [loaded, plots.data, catalog.data]);
  const ticked = picked ?? initialTicks(proposals);

  const loadError = plots.error || catalog.error ? 'Could not load shops and tags.' : null;
  if (error || loadError) return <p className="admin-comments__error">{error || loadError}</p>;
  if (!loaded) return <p>Finding tags…</p>;

  // The first change starts from the default ticks (`picked` is null until then).
  const toggle = (plotId, tagId) => setPicked((prev) => {
    const t = prev ?? ticked;
    const ids = t[plotId] ?? [];
    return { ...t, [plotId]: ids.includes(tagId) ? ids.filter((id) => id !== tagId) : [...ids, tagId] };
  });
  const chosen = proposals.filter((p) => ticked[p.plot.id]?.length);
  const tagCount = chosen.reduce((n, p) => n + ticked[p.plot.id].length, 0);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch('/api/admin/tags/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shops: chosen.map((p) => ({ plot_id: p.plot.id, tag_ids: ticked[p.plot.id] })) }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Could not add the tags.');
      setMessage(`Added ${result.tags} tags to ${result.shops} shops.`);
      setConfirming(false);
      setPicked({});
      await plotsResource.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-autotag">
      <p className="admin-editor__hint">
        Tags whose name or other name appears in a shop's description or stock. Matches on the full name or a
        long other name are ticked; short ones like "MR" aren't, since they're more often wrong. Click a tag to
        tick or untick it. This only adds tags; nothing is removed.
      </p>
      {message && <p className="admin-autotag__done">{message}</p>}

      {proposals.length === 0 ? (
        <p className="admin-editor__hint">No new tags found in any shop's text.</p>
      ) : (
        <>
          <div className="admin-autotag__bar">
            <span>
              {tagCount} tags ticked <span className="admin-autotag__muted">on {chosen.length} of {proposals.length} shops</span>
            </span>
            {confirming ? (
              <span className="admin-autotag__confirm">
                <button type="button" onClick={apply} disabled={busy}>
                  {busy ? 'Adding…' : `Yes, add ${tagCount} tags`}
                </button>
                <button type="button" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} disabled={tagCount === 0}>Add ticked tags</button>
            )}
          </div>

          <ul className="admin-autotag__list">
            {proposals.map(({ plot, text, matches }) => (
              <li key={plot.id}>
                <div>
                  <strong>{displayName(plot.shop)}</strong>{' '}
                  <Link to={`/plot/${plot.id}`} className="admin-autotag__muted">{plot.id}</Link>
                </div>
                <p className="admin-autotag__text">{text.trim()}</p>
                <ul className="tag-chips">
                  {matches.map(({ tag, term }) => {
                    const on = ticked[plot.id]?.includes(tag.id);
                    return (
                      <li key={tag.id}>
                        <button type="button" aria-pressed={!!on} onClick={() => toggle(plot.id, tag.id)}
                          className={`tag-chip admin-autotag__chip${tag.color ? '' : ' tag-chip--plain'}`}
                          style={tag.color ? { '--tag-color': tag.color } : undefined}>
                          {tag.name}
                          {term !== tag.name && <span className="admin-autotag__via">"{term}"</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default AdminAutoTag;
