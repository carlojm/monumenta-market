import { useCallback, useRef } from 'react';
import { ListFilter, X } from 'lucide-react';
import TagPicker from './TagPicker';
import { TAG_MODES, filterLabel, isActive } from '../lib/filters';
import { useDismiss } from '../lib/useDismiss';
import './Toolbar.css';

// "Filter" button in the toolbar: adds a tag filter and opens it.
export function FilterButton({ onAdd }) {
  return (
    <button type="button" className="toolbar__button" onClick={onAdd}>
      <ListFilter size={14} aria-hidden="true" />
      Filter
    </button>
  );
}

// The row of filter chips under the search bar. Clicking a chip opens its
// popup: any / all / none, then the tags. Closing a filter with no tags chosen
// removes it.
export function FilterChips({ filters, catalog, openId, onOpen, onChange, onRemove, onClear }) {
  const ref = useRef(null);
  const open = filters.find((f) => f.id === openId);

  const close = useCallback(() => {
    if (open && !isActive(open)) onRemove(open.id);
    onOpen(null);
  }, [open, onOpen, onRemove]);
  useDismiss(ref, !!open, close);

  if (filters.length === 0) return null;
  const update = (changes) => onChange({ ...open, ...changes });

  return (
    <div className="filters" ref={ref}>
      <ul className="filters__chips">
        {filters.map((f) => (
          <li key={f.id}>
            <button type="button" className="filters__chip" aria-expanded={f.id === openId}
              onClick={() => (f.id === openId ? close() : onOpen(f.id))}>
              {filterLabel(f, catalog)}
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
        <div className="filters__popup" role="dialog" aria-label="Tag filter">
          <div className="filters__popup-head">
            <div className="toolbar__directions filters__modes">
              {TAG_MODES.map((m) => (
                <button key={m.key} type="button" aria-pressed={open.mode === m.key} onClick={() => update({ mode: m.key })}>
                  {m.label}
                </button>
              ))}
            </div>
            <button type="button" className="filters__remove" onClick={() => { onRemove(open.id); onOpen(null); }}
              aria-label="Remove filter" title="Remove filter">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <TagPicker catalog={catalog} value={open.tagIds} onChange={(tagIds) => update({ tagIds })} />
        </div>
      )}
    </div>
  );
}
