import { useCallback, useRef, useState } from 'react';
import { ListFilter, X } from 'lucide-react';
import TagPicker from './TagPicker';
import { FILTER_TYPES, STATUS_OPTIONS, TAG_MODES, filterLabel, hasChoices, isActive } from '../lib/filters';
import { useDismiss } from '../lib/useDismiss';
import './Toolbar.css';

// "Filter" button in the toolbar: a menu of what to filter by. Picking one
// adds that filter and opens it; "Hide vacant plots" is added as it is.
export function FilterButton({ filters, onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const dismissRef = useDismiss(ref, close);
  const hidingVacant = filters.some((f) => f.type === 'occupied');
  const onlyStarred = filters.some((f) => f.type === 'starred');

  const add = (type) => {
    setOpen(false);
    onAdd(type);
  };

  return (
    <div className="toolbar__menu-wrap" ref={ref}>
      <button type="button" className="toolbar__button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ListFilter size={14} aria-hidden="true" />
        Filter
      </button>
      {open && (
        <div className="toolbar__menu" role="menu" ref={dismissRef}>
          <p className="toolbar__menu-heading">Filter by</p>
          {FILTER_TYPES.map((t) => (
            <button key={t.type} type="button" role="menuitem" className="toolbar__menu-item" onClick={() => add(t.type)}>
              {t.label}
            </button>
          ))}
          <div className="toolbar__menu-divider" />
          <button type="button" role="menuitem" className="toolbar__menu-item" disabled={hidingVacant}
            onClick={() => add('occupied')}>
            Hide vacant plots
          </button>
          <button type="button" role="menuitem" className="toolbar__menu-item" disabled={onlyStarred}
            onClick={() => add('starred')}>
            Only starred shops
          </button>
        </div>
      )}
    </div>
  );
}

// Toggle buttons for a status or zone filter ("is any of").
function OptionList({ options, values, onChange }) {
  const toggle = (key) => onChange(values.includes(key) ? values.filter((v) => v !== key) : [...values, key]);
  return (
    <ul className="filters__options">
      {options.map((o) => (
        <li key={o.key}>
          <button type="button" aria-pressed={values.includes(o.key)} onClick={() => toggle(o.key)}>
            {o.color && <span className="filters__swatch" style={{ background: o.color }} aria-hidden="true" />}
            {o.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

// The row of filter chips under the search bar. Clicking a chip opens its
// popup (its ✕ just closes it); each chip's own × removes the filter.
// Closing a filter with nothing chosen removes it too. "Vacant plots hidden"
// has nothing to choose, so it only has the ×.
export function FilterChips({ filters, catalog, zones, openId, onOpen, onChange, onRemove, onClear }) {
  const ref = useRef(null);
  const open = filters.find((f) => f.id === openId);

  const close = useCallback(() => {
    if (open && !isActive(open)) onRemove(open.id);
    onOpen(null);
  }, [open, onOpen, onRemove]);
  const dismissRef = useDismiss(ref, close);

  if (filters.length === 0) return null;
  const update = (changes) => onChange({ ...open, ...changes });

  return (
    <div className="filters" ref={ref}>
      <ul className="filters__chips">
        {filters.map((f) => (
          <li key={f.id} className={`filters__chip${f.id === openId ? ' filters__chip--open' : ''}`}>
            {!hasChoices(f.type) ? (
              <span className="filters__chip-label">{filterLabel(f)}</span>
            ) : (
              <button type="button" className="filters__chip-label" aria-expanded={f.id === openId}
                onClick={() => (f.id === openId ? close() : onOpen(f.id))}>
                {filterLabel(f, catalog)}
              </button>
            )}
            <button type="button" className="filters__chip-remove" aria-label={`Remove filter ${filterLabel(f, catalog)}`}
              title="Remove filter" onClick={() => { onRemove(f.id); if (f.id === openId) onOpen(null); }}>
              <X size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
        {filters.length > 1 && (
          <li>
            <button type="button" className="filters__clear" onClick={onClear}>Clear all</button>
          </li>
        )}
      </ul>

      {open && (
        <div className="filters__popup" role="dialog" aria-label={`${open.type} filter`} ref={dismissRef}>
          <div className="filters__popup-head">
            {open.type === 'tags' ? (
              <div className="toolbar__directions filters__modes">
                {TAG_MODES.map((m) => (
                  <button key={m.key} type="button" aria-pressed={open.mode === m.key} onClick={() => update({ mode: m.key })}>
                    {m.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="filters__popup-title">{open.type === 'status' ? 'Status' : 'Zone'} is any of</span>
            )}
            <button type="button" className="filters__remove" onClick={close} aria-label="Close" title="Close">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {open.type === 'tags' && (
            <TagPicker catalog={catalog} value={open.tagIds} onChange={(tagIds) => update({ tagIds })} />
          )}
          {open.type === 'status' && (
            <OptionList options={STATUS_OPTIONS} values={open.values} onChange={(values) => update({ values })} />
          )}
          {open.type === 'zone' && (
            <OptionList options={zones.map((z) => ({ key: z, label: z }))} values={open.values}
              onChange={(values) => update({ values })} />
          )}
        </div>
      )}
    </div>
  );
}
