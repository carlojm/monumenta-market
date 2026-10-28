import { useEffect, useState } from 'react';
import TagPicker from './TagPicker';
import './TagEditor.css';

// "Edit tags" popup on the card, for linked players. Click tags to add or
// remove them; the summary of changes doubles as the confirmation.
function TagEditor({ plotId, shopTags, onClose, onSaved }) {
  const [catalog, setCatalog] = useState(null);
  const [ids, setIds] = useState(shopTags.map((t) => t.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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
        <TagPicker catalog={catalog} value={ids} onChange={setIds} />

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
