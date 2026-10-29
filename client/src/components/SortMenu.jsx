import { useCallback, useRef, useState } from 'react';
import { ArrowDownUp, Check } from 'lucide-react';
import { SORTS } from '../lib/sort';
import { useDismiss } from '../lib/useDismiss';
import './Toolbar.css';

// "Sort" button above the plot list. Opens a small menu: what to sort by,
// then which way. "Best match" is only offered while searching.
function SortMenu({ sort, onChange, searching }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const options = SORTS.filter((s) => searching || !s.searchOnly);
  const current = SORTS.find((s) => s.key === sort.key);

  return (
    <div className="toolbar__menu-wrap" ref={ref}>
      <button type="button" className="toolbar__button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ArrowDownUp size={14} aria-hidden="true" />
        {/* Phones just say "Sort"; the menu shows which one is picked. */}
        <span className="toolbar__label--wide">{current.label}</span>
        <span className="toolbar__label--narrow">Sort</span>
      </button>
      {open && (
        <div className="toolbar__menu" role="menu">
          <p className="toolbar__menu-heading">Sort by</p>
          {options.map((s) => (
            <button key={s.key} type="button" role="menuitemradio" aria-checked={s.key === sort.key}
              className="toolbar__menu-item" onClick={() => onChange({ key: s.key, reversed: false })}>
              <Check size={14} aria-hidden="true" className="toolbar__check" />
              {s.label}
            </button>
          ))}
          {current.directions && (
            <div className="toolbar__directions">
              {current.directions.map((label, i) => (
                <button key={label} type="button" aria-pressed={sort.reversed === (i === 1)}
                  onClick={() => onChange({ ...sort, reversed: i === 1 })}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SortMenu;
