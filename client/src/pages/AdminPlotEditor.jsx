import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/adminAuth';

function AdminPlotEditor() {
  const [plots, setPlots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [images, setImages] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch('/api/plots').then((res) => res.json()).then(setPlots);
  }, []);

  const selectPlot = async (plot) => {
    setSelected(plot);
    setForm({
      owner: plot.owner || '',
      shop_name: plot.shop_name || '',
      zone: plot.zone || '',
      status: plot.status || 'active',
      description: plot.description || '',
    });
    const res = await fetch(`/api/plots/${plot.x}/${plot.z}`);
    const detail = await res.json();
    setImages(detail.images || []);
  };

  const handleChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSave = async () => {
    setStatus('saving');
    const res = await adminFetch(`/api/plots/${selected.x}/${selected.z}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setStatus(res.ok ? 'saved' : 'error');
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const body = new FormData();
    body.append('image', file);

    const res = await adminFetch(`/api/plots/${selected.x}/${selected.z}/image`, {
      method: 'POST',
      body,
    });
    if (res.ok) {
      const newImage = await res.json();
      setImages((prev) => [...prev, newImage]);
    }
  };

  const handleDeleteImage = async (id) => {
    await adminFetch(`/api/admin/images/${id}`, { method: 'DELETE' });
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  return (
    <div className="admin-editor">
      <div className="admin-editor__list">
        <h3>Plots</h3>
        <ul>
          {plots.map((p) => (
            <li key={`${p.x}_${p.z}`}>
              <button onClick={() => selectPlot(p)}>
                {p.shop_name || p.owner || `${p.x}, ${p.z}`}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <div className="admin-editor__form">
          <h3>{selected.x}, {selected.z}</h3>

          <label>
            Owner
            <input value={form.owner} onChange={(e) => handleChange('owner', e.target.value)} />
          </label>

          <label>
            Shop name
            <input value={form.shop_name} onChange={(e) => handleChange('shop_name', e.target.value)} />
          </label>

          <label>
            Zone
            <input value={form.zone} onChange={(e) => handleChange('zone', e.target.value)} />
          </label>

          <label>
            Status
            <select value={form.status} onChange={(e) => handleChange('status', e.target.value)}>
              <option value="active">active</option>
              <option value="closed">closed</option>
              <option value="locked">locked</option>
              <option value="unclear">unclear</option>
            </select>
          </label>

          <label>
            Description
            <textarea
              rows={6}
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
            />
          </label>

          <button onClick={handleSave}>Save changes</button>
          {status === 'saved' && <span> Saved.</span>}
          {status === 'error' && <span> Save failed — check admin token.</span>}

          <h3>Images</h3>
          <div className="admin-editor__images">
            {images.map((img) => (
              <div key={img.id} className="admin-editor__image">
                <img src={img.url} alt="" />
                <button onClick={() => handleDeleteImage(img.id)}>Remove</button>
              </div>
            ))}
          </div>
          <input type="file" accept="image/*" onChange={handleUpload} />
        </div>
      )}
    </div>
  );
}

export default AdminPlotEditor;