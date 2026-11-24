import { useState } from 'react';
import { adminFetch } from '../lib/adminAuth';
import ColorInput from '../components/ColorInput';
import AdminAutoTag from './AdminAutoTag';
import { timeAgo } from '../lib/reports';
import { createResource, tagsResource, useResource } from '../lib/resource';
import '../components/TagChips.css';

// Moderators and admins: manage the tag lists. Tags show in this order
// everywhere; ↑ ↓ move a tag within its group.

const splitAliases = (text) => text.split(',').map((a) => a.trim()).filter(Boolean);

async function send(url, method, body) {
  const res = await adminFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

// Every tag, with suggestions and groups (lib/resource.js: loads when the
// page opens, and on refresh after each change).
const adminTagsResource = createResource(() => adminFetch('/api/admin/tags').then((res) => {
  if (!res.ok) throw new Error('Could not load tags.');
  return res.json();
}));

function Chip({ tag }) {
  const color = tag.effective_color;
  return (
    <span className={`tag-chip${color ? '' : ' tag-chip--plain'}`} style={color ? { '--tag-color': color } : undefined}>
      {tag.name}
    </span>
  );
}

// The fields shared by "Add a tag" and editing one.
function TagFields({ draft, setDraft, groups, showKind }) {
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <>
      {showKind && (
        <label>
          Kind
          <select value={draft.kind} onChange={(e) => set('kind')(e.target.value)}>
            <option value="stock">Stock tag (what the shop sells)</option>
            <option value="category">Category (what kind of shop)</option>
          </select>
        </label>
      )}
      <label>
        Name
        <input type="text" value={draft.name} onChange={(e) => set('name')(e.target.value)} />
      </label>
      <label>
        Aliases
        <input type="text" value={draft.aliases} placeholder="Comma separated, e.g. white, howb"
          onChange={(e) => set('aliases')(e.target.value)} />
        <span className="admin-editor__hint">Other names people search for. They find this tag like its name does.</span>
      </label>
      {draft.kind === 'stock' && (
        <label>
          Group
          <select value={draft.group_id} onChange={(e) => set('group_id')(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      )}
      <label>
        Color
        <ColorInput value={draft.color} onChange={set('color')} />
        <span className="admin-editor__hint">
          {draft.kind === 'stock' ? "Leave empty to use the group's color." : 'Leave empty for a plain chip.'}
        </span>
      </label>
    </>
  );
}

const toBody = (draft) => ({
  kind: draft.kind,
  name: draft.name,
  aliases: splitAliases(draft.aliases),
  group_id: draft.kind === 'stock' ? Number(draft.group_id) : null,
  color: draft.color.trim() || null,
});

function TagRow({ tag, groups, isFirst, isLast, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setDraft({ kind: tag.kind, name: tag.name, aliases: tag.aliases.join(', '), group_id: tag.group_id ?? '', color: tag.color ?? '' });
    setError(null);
    setEditing(true);
  };
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const move = (direction) => run(() => send(`/api/admin/tags/${tag.id}/move`, 'POST', { direction }));
  const save = async (e) => {
    e.preventDefault();
    if (await run(() => send(`/api/admin/tags/${tag.id}`, 'PUT', toBody(draft)))) setEditing(false);
  };

  return (
    <li className="admin-tags__row">
      <div className="admin-tags__summary">
        <Chip tag={tag} />
        {tag.aliases.length > 0 && <span className="admin-comments__muted">also: {tag.aliases.join(', ')}</span>}
        <span className="admin-comments__muted">
          {tag.shop_count} shop{tag.shop_count === 1 ? '' : 's'}
        </span>
        <span className="admin-tags__actions">
          <button type="button" onClick={() => move('up')} disabled={busy || isFirst} aria-label={`Move ${tag.name} up`}>↑</button>
          <button type="button" onClick={() => move('down')} disabled={busy || isLast} aria-label={`Move ${tag.name} down`}>↓</button>
          {!editing && <button type="button" onClick={startEdit}>Edit</button>}
        </span>
      </div>
      {editing && (
        <form className="admin-tags__form" onSubmit={save}>
          <TagFields draft={draft} setDraft={setDraft} groups={groups} />
          <div className="admin-editor__actions">
            <button type="submit" disabled={busy || !draft.name.trim()}>Save</button>
            <button type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p className="admin-comments__error">{error}</p>}
    </li>
  );
}

// A player's suggested tag, waiting for review.
function SuggestionRow({ tag, groups, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [addToShop, setAddToShop] = useState(!!tag.suggested_for_shop_open);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const groupName = groups.find((g) => g.id === tag.group_id)?.name;

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  const startEdit = () => {
    setDraft({ kind: tag.kind, name: tag.name, aliases: tag.aliases.join(', '), group_id: tag.group_id ?? '', color: tag.color ?? '' });
    setEditing(true);
  };
  const saveEdit = (e) => {
    e.preventDefault();
    run(async () => {
      await send(`/api/admin/tags/${tag.id}`, 'PUT', toBody(draft));
      setEditing(false);
      setBusy(false);
    });
  };

  return (
    <li className="admin-tags__row admin-tags__suggestion">
      <div className="admin-tags__summary">
        <Chip tag={tag} />
        <span className="admin-comments__muted">{tag.kind === 'category' ? 'category' : groupName}</span>
        {tag.aliases.length > 0 && <span className="admin-comments__muted">also: {tag.aliases.join(', ')}</span>}
      </div>
      <p className="admin-tags__suggested-by">
        Suggested by <strong>{tag.suggested_by_name ?? 'a deleted account'}</strong>
        {tag.suggested_for_plot && (
          <>
            {' '}for{' '}
            <a href={`/plot/${tag.suggested_for_plot}`} target="_blank" rel="noreferrer">
              {tag.suggested_for_owner}'s shop <span className="coord">{tag.suggested_for_plot}</span>
            </a>
            {!tag.suggested_for_shop_open && <span className="admin-comments__muted"> (that shop has since closed)</span>}
          </>
        )}{' '}
        <span className="admin-comments__muted">{timeAgo(tag.created_at)}</span>
      </p>

      {editing ? (
        <form className="admin-tags__form" onSubmit={saveEdit}>
          <TagFields draft={draft} setDraft={setDraft} groups={groups} />
          <div className="admin-editor__actions">
            <button type="submit" disabled={busy || !draft.name.trim()}>Save</button>
            <button type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : confirmingReject ? (
        <div className="admin-tags__decide">
          <span>Reject and delete this suggestion?</span>
          <button type="button" disabled={busy} onClick={() => run(() => send(`/api/admin/tags/${tag.id}/reject`, 'POST'))}>
            Yes, reject
          </button>
          <button type="button" onClick={() => setConfirmingReject(false)}>Cancel</button>
        </div>
      ) : (
        <div className="admin-tags__decide">
          {tag.suggested_for_shop_open ? (
            <label>
              <input type="checkbox" checked={addToShop} onChange={(e) => setAddToShop(e.target.checked)} />
              Also add it to {tag.suggested_for_owner}'s shop
            </label>
          ) : null}
          <button type="button" className="admin-tags__approve" disabled={busy}
            onClick={() => run(() => send(`/api/admin/tags/${tag.id}/approve`, 'POST', { add_to_shop: addToShop }))}>
            Approve
          </button>
          <button type="button" onClick={startEdit}>Edit</button>
          <button type="button" onClick={() => setConfirmingReject(true)}>Reject</button>
        </div>
      )}
      {error && <p className="admin-comments__error">{error}</p>}
    </li>
  );
}

function GroupColor({ group, onChanged }) {
  const [color, setColor] = useState(group.color ?? '');
  const [error, setError] = useState(null);
  const changed = color.trim() !== (group.color ?? '');
  const save = async () => {
    setError(null);
    try {
      await send(`/api/admin/tag-groups/${group.id}`, 'PUT', { color: color.trim() || null });
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <li className="admin-tags__group">
      <span className="admin-tags__group-name">{group.name}</span>
      <ColorInput value={color} onChange={setColor} />
      {changed && <button type="button" onClick={save}>Save</button>}
      {error && <span className="admin-comments__error">{error}</span>}
    </li>
  );
}

const newDraft = (groups) => ({ kind: 'stock', name: '', aliases: '', group_id: groups[0]?.id ?? '', color: '' });

function AdminTags() {
  const { data, error } = useResource(adminTagsResource);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(null); // the "Add a tag" draft, or null when closed
  const [addError, setAddError] = useState(null);
  const [autoTagOpen, setAutoTagOpen] = useState(false); // only load it when opened

  // The public tag list too, so the filters and the edit form see the change.
  const reload = () => Promise.all([adminTagsResource.refresh(), tagsResource.refresh()]);

  if (error) return <p className="admin-comments__error">{error}</p>;
  if (!data) return <p>Loading tags…</p>;

  const approved = data.tags.filter((t) => t.status === 'approved');
  const pending = data.tags.filter((t) => t.status === 'pending');
  const q = query.trim().toLowerCase();
  const matches = (t) => !q || [t.name, ...t.aliases].some((term) => term.toLowerCase().includes(q));
  const sections = [
    { key: 'categories', name: 'Categories', tags: approved.filter((t) => t.kind === 'category') },
    ...data.groups.map((g) => ({ key: g.id, name: g.name, tags: approved.filter((t) => t.kind === 'stock' && t.group_id === g.id) })),
  ];

  const add = async (e) => {
    e.preventDefault();
    setAddError(null);
    try {
      await send('/api/admin/tags', 'POST', toBody(adding));
      setAdding(null);
      await reload();
    } catch (err) {
      setAddError(err.message);
    }
  };

  return (
    <div className="admin-tags">
      {pending.length > 0 && (
        <section className="admin-tags__section admin-tags__suggestions">
          <h3>Suggestions to review ({pending.length})</h3>
          <ul>
            {pending.map((t) => <SuggestionRow key={t.id} tag={t} groups={data.groups} onChanged={reload} />)}
          </ul>
        </section>
      )}

      <details className="admin-tags__groups">
        <summary>Group colors</summary>
        <p className="admin-editor__hint">Stock tags without their own color use their group's color.</p>
        <ul>
          {data.groups.map((g) => <GroupColor key={g.id} group={g} onChanged={reload} />)}
        </ul>
      </details>

      <details className="admin-tags__groups" onToggle={(e) => setAutoTagOpen(e.currentTarget.open)}>
        <summary>Auto-tag shops from their descriptions</summary>
        {autoTagOpen && <AdminAutoTag />}
      </details>

      {adding ? (
        <form className="admin-tags__form admin-tags__add" onSubmit={add}>
          <h3>Add a tag</h3>
          <TagFields draft={adding} setDraft={setAdding} groups={data.groups} showKind />
          {addError && <p className="admin-comments__error">{addError}</p>}
          <div className="admin-editor__actions">
            <button type="submit" disabled={!adding.name.trim()}>Add tag</button>
            <button type="button" onClick={() => setAdding(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => { setAddError(null); setAdding(newDraft(data.groups)); }}>+ Add a tag</button>
      )}

      <input type="text" className="admin-tags__filter" placeholder="Find a tag (names and aliases)…"
        value={query} onChange={(e) => setQuery(e.target.value)} />

      {sections.map((s) => {
        const shown = s.tags.filter(matches);
        if (!shown.length) return null;
        return (
          <section key={s.key} className="admin-tags__section">
            <h3>{s.name}</h3>
            <ul>
              {shown.map((t) => (
                <TagRow key={t.id} tag={t} groups={data.groups} onChanged={reload}
                  isFirst={t.id === s.tags[0].id} isLast={t.id === s.tags.at(-1).id} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default AdminTags;
