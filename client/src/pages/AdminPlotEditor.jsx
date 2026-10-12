import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminAuth';
import { displayName } from '../lib/plots';

const FIELDS = [
  { key: 'owner', label: 'Owner (player name, or guild tag without brackets)' },
  { key: 'shop_name', label: 'Shop name' },
  { key: 'guild_name', label: 'Guild name (guild shops only)' },
  { key: 'description', label: 'Description', multiline: true },
  { key: 'stock', label: 'Stock (search keywords)', multiline: true },
  { key: 'palette', label: 'Block palette' },
  { key: 'guild_color', label: 'Guild color' },
  { key: 'primary_color', label: 'Primary color' },
  { key: 'secondary_color', label: 'Secondary color' },
];

const emptyForm = () => Object.fromEntries(FIELDS.map((f) => [f.key, '']));

function AdminPlotEditor() {
  const [plots, setPlots] = useState([]);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [shop, setShop] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [rename, setRename] = useState(false);
  const [confirming, setConfirming] = useState(null); // 'owner' | 'vacate' | null
  const [message, setMessage] = useState(null);

  const loadPlots = () => fetch('/api/plots').then((res) => res.json()).then(setPlots);
  useEffect(() => {
    loadPlots();
  }, []);

  const selectPlot = async (id) => {
    setSelectedId(id);
    setMessage(null);
    setConfirming(null);
    setRename(false);
    const detail = await fetch(`/api/plots/${id}`).then((res) => res.json());
    setShop(detail.shop);
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, detail.shop?.[f.key] ?? ''])));
  };

  const ownerChanged = shop && form.owner.trim() !== shop.owner;

  const save = async () => {
    setConfirming(null);
    setMessage('Saving…');
    const res = await adminFetch(`/api/plots/${selectedId}/shop`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, owner: form.owner.trim(), rename: ownerChanged && rename }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(`Save failed: ${body.error || res.statusText}`);
    setMessage(body.opened ? 'Saved. A new shop was opened on this plot.' : 'Saved.');
    await Promise.all([loadPlots(), selectPlot(selectedId)]);
  };

  const handleSave = () => {
    if (ownerChanged && !rename) setConfirming('owner');
    else save();
  };

  const vacate = async () => {
    setConfirming(null);
    const res = await adminFetch(`/api/plots/${selectedId}/vacate`, { method: 'POST' });
    if (!res.ok) return setMessage('Vacate failed.');
    setMessage('Plot is now vacant. The old shop was archived.');
    await Promise.all([loadPlots(), selectPlot(selectedId)]);
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
            <span className="coord">{selectedId}</span> · {shop ? displayName(shop) : 'Vacant'}
          </h3>
          {!shop && <p>This plot is vacant. Fill in an owner to open a shop.</p>}

          {FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              {f.multiline ? (
                <textarea rows={f.key === 'description' ? 6 : 3} value={form[f.key]}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
              ) : (
                <input type="text" value={form[f.key]}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
              )}
              {f.key === 'owner' && ownerChanged && (
                <span className="admin-editor__rename">
                  <input type="checkbox" checked={rename} onChange={(e) => setRename(e.target.checked)} />
                  This is a typo fix or name change, not a new shop
                </span>
              )}
            </label>
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
              <button onClick={handleSave}>{shop ? 'Save changes' : 'Open shop'}</button>
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
