import { Fragment, useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminAuth';
import { displayName } from '../lib/plots';
import TagPicker from '../components/TagPicker';
import ColorInput from '../components/ColorInput';

const FIELDS = [
  { key: 'owner', label: 'Owner (player name, or guild tag without brackets)' },
  {
    key: 'shop_name',
    label: 'Shop name',
    hint: "Leave blank to use the owner's name. Only fill this in if the shop has its own name.",
  },
  { key: 'guild_name', label: 'Guild name (guild shops only)' },
  { key: 'description', label: 'Description', multiline: true },
  { key: 'stock', label: 'Stock (search keywords)', multiline: true },
  { key: 'palette', label: 'Block palette' },
  { key: 'guild_color', label: 'Guild color', color: true },
  { key: 'primary_color', label: 'Primary color', color: true },
  { key: 'secondary_color', label: 'Secondary color', color: true },
];

const emptyForm = () => Object.fromEntries(FIELDS.map((f) => [f.key, '']));

function AdminPlotEditor() {
  const [plots, setPlots] = useState([]);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [shop, setShop] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [original, setOriginal] = useState(emptyForm()); // the values as loaded, to spot edits
  const [pendingSwitch, setPendingSwitch] = useState(null); // plot to open after discarding edits
  const [rename, setRename] = useState(false);
  const [confirming, setConfirming] = useState(null); // 'owner' | 'vacate' | null
  const [message, setMessage] = useState(null);

  // Tags are kept apart from the text fields: a list of tag ids.
  const [tagCatalog, setTagCatalog] = useState(null);
  const [tagIds, setTagIds] = useState([]);
  const [originalTagIds, setOriginalTagIds] = useState([]);

  const loadPlots = () => fetch('/api/plots').then((res) => res.json()).then(setPlots);
  useEffect(() => {
    loadPlots();
    fetch('/api/tags').then((res) => res.json()).then(setTagCatalog);
  }, []);

  const sameIds = (a, b) => a.length === b.length && a.every((id) => b.includes(id));
  const tagsChanged = !sameIds(tagIds, originalTagIds);
  const changedFields = FIELDS.filter((f) => form[f.key] !== original[f.key]).map((f) => f.key);
  const dirty = changedFields.length > 0 || tagsChanged;

  // Closing or reloading the tab with unsaved edits asks the browser to confirm.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = ''; // some browsers only prompt when this is set
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const loadPlot = async (id) => {
    setSelectedId(id);
    setMessage(null);
    setConfirming(null);
    setRename(false);
    setPendingSwitch(null);
    const detail = await fetch(`/api/plots/${id}`).then((res) => res.json());
    const values = Object.fromEntries(FIELDS.map((f) => [f.key, detail.shop?.[f.key] ?? '']));
    setShop(detail.shop);
    setForm(values);
    setOriginal(values);
    const ids = (detail.shop?.tags ?? []).map((t) => t.id);
    setTagIds(ids);
    setOriginalTagIds(ids);
  };

  // Switching plots with unsaved edits asks first instead of throwing them away.
  const selectPlot = (id) => {
    if (id === selectedId) return;
    if (dirty) setPendingSwitch(id);
    else loadPlot(id);
  };

  const discardChanges = () => {
    setForm(original);
    setTagIds(originalTagIds);
    setRename(false);
    setConfirming(null);
  };

  const ownerChanged = shop && form.owner.trim() !== shop.owner;

  const save = async () => {
    setConfirming(null);
    setMessage('Saving…');
    const res = await adminFetch(`/api/plots/${selectedId}/shop`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, owner: form.owner.trim(), rename: ownerChanged && rename, tag_ids: tagIds }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(`Save failed: ${body.error || res.statusText}`);
    await Promise.all([loadPlots(), loadPlot(selectedId)]);
    setMessage(body.opened ? 'Saved. A new shop was opened on this plot.' : 'Saved.');
  };

  const handleSave = () => {
    if (ownerChanged && !rename) setConfirming('owner');
    else save();
  };

  const vacate = async () => {
    setConfirming(null);
    const res = await adminFetch(`/api/plots/${selectedId}/vacate`, { method: 'POST' });
    if (!res.ok) return setMessage('Vacate failed.');
    await Promise.all([loadPlots(), loadPlot(selectedId)]);
    setMessage('Plot is now vacant. The old shop was archived.');
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const body = new FormData();
    body.append('image', file);
    const res = await adminFetch(`/api/plots/${selectedId}/image`, { method: 'POST', body });
    if (res.ok) {
      const image = await res.json();
      setShop((s) => ({ ...s, images: [...s.images, image] }));
    } else {
      setMessage('Upload failed.');
    }
    e.target.value = '';
  };

  const handleDeleteImage = async (id) => {
    await adminFetch(`/api/admin/images/${id}`, { method: 'DELETE' });
    setShop((s) => ({ ...s, images: s.images.filter((img) => img.id !== id) }));
  };

  const q = filter.trim().toLowerCase();
  const visible = q
    ? plots.filter((p) => `${p.id} ${p.zone} ${p.shop?.owner ?? ''} ${p.shop?.shop_name ?? ''} ${p.shop?.guild_name ?? ''}`
        .toLowerCase().includes(q))
    : plots;

  return (
    <div className="admin-editor">
      <div className="admin-editor__list">
        <h3>Plots</h3>
        <input type="text" placeholder="Filter by id, zone, owner…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul>
          {visible.map((p) => (
            <li key={p.id}>
              <button onClick={() => selectPlot(p.id)} aria-current={p.id === selectedId}>
                <span className="coord">{p.id}</span> {displayName(p.shop)}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selectedId && (
        <div className="admin-editor__form">
          <h3>
            <span className="coord">{selectedId}</span> {shop ? displayName(shop) : 'Vacant'}
          </h3>
          {!shop && <p>This plot is vacant. Fill in an owner to open a shop.</p>}
          {pendingSwitch && (
            <div className="admin-editor__confirm">
              <p>
                You have unsaved changes to <strong>{selectedId}</strong>. Switch to{' '}
                <strong>{pendingSwitch}</strong> and lose them?
              </p>
              <button onClick={() => loadPlot(pendingSwitch)}>Discard and switch</button>
              <button onClick={() => setPendingSwitch(null)}>Keep editing</button>
            </div>
          )}

          {FIELDS.map((f) => (
            <Fragment key={f.key}>
              <label className={changedFields.includes(f.key) ? 'admin-editor__field--changed' : undefined}>
                <span>
                  {f.label}
                  {changedFields.includes(f.key) && <span className="admin-editor__edited"> edited</span>}
                </span>
                {f.color ? (
                  <ColorInput value={form[f.key]} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} />
                ) : f.multiline ? (
                  <textarea rows={f.key === 'description' ? 6 : 3} value={form[f.key]}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
                ) : (
                  <input type="text" value={form[f.key]}
                    // An empty shop name shows the name the site will use instead.
                    placeholder={f.key === 'shop_name' ? form.guild_name || form.owner : undefined}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
                )}
                {f.hint && <span className="admin-editor__hint">{f.hint}</span>}
                {f.key === 'owner' && ownerChanged && (
                  <span className="admin-editor__rename">
                    <input type="checkbox" checked={rename} onChange={(e) => setRename(e.target.checked)} />
                    This is a typo fix or name change, not a new shop
                  </span>
                )}
              </label>
              {/* The tag picker sits right after the Stock field. */}
              {f.key === 'stock' && (
                <div className={`admin-editor__tags${tagsChanged ? ' admin-editor__field--changed' : ''}`}>
                  <span>
                    Tags
                    {tagsChanged && <span className="admin-editor__edited"> edited</span>}
                  </span>
                  <TagPicker catalog={tagCatalog} value={tagIds} onChange={setTagIds} />
                </div>
              )}
            </Fragment>
          ))}

          {confirming === 'owner' ? (
            <div className="admin-editor__confirm">
              <p>
                Changing the owner from <strong>{shop.owner}</strong> to <strong>{form.owner.trim()}</strong> archives
                the current shop with its comments and images, and starts a new shop on this plot.
                If you only fixed a typo, cancel and tick the checkbox instead.
              </p>
              <button onClick={save}>Yes, it's a new shop</button>
              <button onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          ) : confirming === 'vacate' ? (
            <div className="admin-editor__confirm">
              <p>Archive <strong>{shop.owner}</strong>'s shop and mark this plot vacant?</p>
              <button onClick={vacate}>Yes, vacate</button>
              <button onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          ) : (
            <div className="admin-editor__actions">
              <button onClick={handleSave} disabled={!dirty}>{shop ? 'Save changes' : 'Open shop'}</button>
              {dirty && <button onClick={discardChanges}>Discard changes</button>}
              {shop && <button onClick={() => setConfirming('vacate')}>Vacate plot</button>}
            </div>
          )}
          {message && <p>{message}</p>}

          {shop && (
            <>
              <h3>Images</h3>
              <div className="admin-editor__images">
                {shop.images.map((img) => (
                  <div key={img.id} className="admin-editor__image">
                    <img src={img.url} alt="" />
                    <button onClick={() => handleDeleteImage(img.id)}>Remove</button>
                  </div>
                ))}
              </div>
              <input type="file" accept="image/*" onChange={handleUpload} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminPlotEditor;
