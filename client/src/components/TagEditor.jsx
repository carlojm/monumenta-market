import { useState } from 'react';
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

  const submit = async () => {
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
    // A group, not a <form>: it sits inside the shop edit form.
    <div className="tag-editor__suggest" role="group" aria-labelledby="tag-editor-suggest-title">
      <h4 id="tag-editor-suggest-title">Suggest a new tag</h4>
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
        <button type="button" className="tag-editor__save" onClick={submit}
          disabled={!draft.name.trim() || !!existing || sending}>
          {sending ? 'Sending…' : 'Send suggestion'}
        </button>
        <button type="button" onClick={onCancel}>Back</button>
      </div>
    </div>
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
      <span className="tag-editor__hint">Found in your text:</span>
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

// The Tags field of the shop edit form. `catalog` is GET /api/tags (null while
// loading); `value` is the chosen tag ids; `text` is the form's About and
// Keywords, so tags they mention are offered as you type.
function TagEditor({ catalog, plotId, value, onChange, text }) {
  const [suggesting, setSuggesting] = useState(false);
  const [thanks, setThanks] = useState(null); // name of a suggestion just sent

  const add = (id) => onChange(value.includes(id) ? value : [...value, id]);

  return (
    <div className="tag-editor">
      {suggesting && catalog ? (
        <SuggestTagForm
          catalog={catalog}
          plotId={plotId}
          onAddExisting={(id) => { add(id); setSuggesting(false); }}
          onDone={(name) => { setThanks(name); setSuggesting(false); }}
          onCancel={() => setSuggesting(false)}
        />
      ) : (
        <>
          {catalog && <TextSuggestions catalog={catalog} text={text} chosen={value} onAdd={add} />}
          <TagPicker catalog={catalog} value={value} onChange={onChange} />
          {thanks ? (
            <p className="tag-editor__thanks">
              Thanks! A moderator will review "{thanks}".
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
    </div>
  );
}

export default TagEditor;
