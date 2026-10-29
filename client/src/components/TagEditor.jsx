import { useEffect, useState } from 'react';
import TagPicker from './TagPicker';
import ColorInput from './ColorInput';
import { suggestTags } from '../lib/tagSuggestions';
import './TagChips.css';
import './TagEditor.css';

// Suggesting a tag that isn't in the list yet. If the name already matches a
// tag (or one of its aliases), offer that tag instead of a duplicate.
function SuggestTagForm({ catalog, plotId, onAddExisting, onDone, onCancel }) {
  const [draft, setDraft] = useState({ kind: 'stock', name: '', aliases: '', group: catalog.groups[0]?.id ?? '', color: '' });
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const typed = draft.name.trim().toLowerCase();
  const existing = typed
    ? catalog.tags.find((t) => [t.name, ...t.aliases].some((term) => term.toLowerCase() === typed))
    : null;

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/tags/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: draft.kind,
          name: draft.name,
          aliases: draft.aliases.split(',').map((a) => a.trim()).filter(Boolean),
          group_id: draft.kind === 'stock' ? Number(draft.group) : null,
          color: draft.color.trim() || null,
          plot_id: plotId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send your suggestion.');
      onDone(draft.name.trim());
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  return (
    <form className="tag-editor__suggest" onSubmit={submit}>
      <h4>Suggest a new tag</h4>
      <p className="tag-editor__hint">
        A moderator will review it. If it's approved, it's added to the tag list and to this shop.
      </p>
      <label>
        Kind
        <select value={draft.kind} onChange={(e) => set('kind')(e.target.value)}>
          <option value="stock">Something the shop sells or offers</option>
          <option value="category">A kind of shop (category)</option>
        </select>
      </label>
      <label>
        Name
        <input type="text" value={draft.name} onChange={(e) => set('name')(e.target.value)} maxLength={60} />
      </label>
      {existing && (
        <p className="tag-editor__exists">
          Already a tag: <strong>{existing.name}</strong>{' '}
          <button type="button" onClick={() => onAddExisting(existing.id)}>Add it</button>
        </p>
      )}
      <label>
        Other names (optional)
        <input type="text" value={draft.aliases} placeholder="Comma separated, e.g. mr, masq"
          onChange={(e) => set('aliases')(e.target.value)} />
      </label>
      {draft.kind === 'stock' && (
        <label>
          Group
          <select value={draft.group} onChange={(e) => set('group')(e.target.value)}>
            {catalog.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      )}
      <label>
        Color (optional)
        <ColorInput value={draft.color} onChange={set('color')} />
      </label>
      {error && <p className="tag-editor__error">{error}</p>}
      <div className="tag-editor__actions">
        <button type="submit" className="tag-editor__save" disabled={!draft.name.trim() || !!existing || sending}>
          {sending ? 'Sending…' : 'Send suggestion'}
        </button>
        <button type="button" onClick={onCancel}>Back</button>
      </div>
    </form>
  );
}

const SUGGESTIONS_SHOWN = 8;

// Tags found in the shop's description and stock text, as dashed chips.
// Clicking one adds it (it then moves up to the chosen tags).
function TextSuggestions({ catalog, text, chosen, onAdd }) {
  const [showAll, setShowAll] = useState(false);
  const found = suggestTags(text, catalog.tags, chosen);
  if (found.length === 0) return null;
  const shown = showAll ? found : found.slice(0, SUGGESTIONS_SHOWN);
  return (
    <div className="tag-editor__from-text">
      <span className="tag-editor__hint">Suggested from this shop's description:</span>
      <ul className="tag-chips">
        {shown.map((t) => (
          <li key={t.id}>
            <button type="button" className="tag-chip--add" onClick={() => onAdd(t.id)}>+ {t.name}</button>
          </li>
        ))}
        {found.length > SUGGESTIONS_SHOWN && !showAll && (
          <li>
            <button type="button" className="tag-editor__suggest-link" onClick={() => setShowAll(true)}>
              Show all ({found.length})
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

// "Edit tags" popup on the card, for linked players. Click tags to add or
// remove them; the summary of changes doubles as the confirmation.
function TagEditor({ plotId, shopTags, shopText, onClose, onSaved }) {
  const [catalog, setCatalog] = useState(null);
  const [ids, setIds] = useState(shopTags.map((t) => t.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [thanks, setThanks] = useState(null); // name of a suggestion just sent

  useEffect(() => {
    fetch('/api/tags').then((res) => res.json()).then(setCatalog).catch(() => setError('Could not load tags.'));
  }, []);

  const original = new Set(shopTags.map((t) => t.id));
  const nameOf = (id) => catalog?.tags.find((t) => t.id === id)?.name ?? shopTags.find((t) => t.id === id)?.name;
  const added = ids.filter((id) => !original.has(id)).map(nameOf);
  const removed = [...original].filter((id) => !ids.includes(id)).map(nameOf);
  const changed = added.length > 0 || removed.length > 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/plots/${plotId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_ids: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save tags.');
      onSaved(data.tags);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="tag-editor__overlay" onClick={onClose}>
      <div className="tag-editor" role="dialog" aria-label="Edit tags" onClick={(e) => e.stopPropagation()}>
        <h3>Edit tags</h3>
        <p className="tag-editor__hint">Click a tag to add it to this shop, or click a chosen one to remove it.</p>
        {suggesting && catalog ? (
          <SuggestTagForm
            catalog={catalog}
            plotId={plotId}
            onAddExisting={(id) => { setIds((v) => (v.includes(id) ? v : [...v, id])); setSuggesting(false); }}
            onDone={(name) => { setThanks(name); setSuggesting(false); }}
            onCancel={() => setSuggesting(false)}
          />
        ) : (
          <>
            {catalog && (
              <TextSuggestions catalog={catalog} text={shopText} chosen={ids}
                onAdd={(id) => setIds((v) => (v.includes(id) ? v : [...v, id]))} />
            )}
            <TagPicker catalog={catalog} value={ids} onChange={setIds} />
            {thanks ? (
              <p className="tag-editor__thanks">
                Thanks! Your suggestion "{thanks}" is waiting for a moderator to review it.
              </p>
            ) : (
              catalog && (
                <button type="button" className="tag-editor__suggest-link" onClick={() => setSuggesting(true)}>
                  Can't find it? Suggest a new tag
                </button>
              )
            )}
          </>
        )}

        {changed && (
          <div className="tag-editor__summary">
            {added.length > 0 && <p><strong>Added:</strong> {added.join(', ')}</p>}
            {removed.length > 0 && <p><strong>Removed:</strong> {removed.join(', ')}</p>}
          </div>
        )}
        {error && <p className="tag-editor__error">{error}</p>}
        <div className="tag-editor__actions">
          <button type="button" className="tag-editor__save" onClick={save} disabled={!changed || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default TagEditor;
