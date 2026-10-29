import { useState } from 'react';
import { tagsForQuery } from '../lib/tagSuggestions';
import './TagChips.css';
import './Toolbar.css';

// The search box. While typing, matching tags are offered under it ("white" ->
// Halls of Wind and Blood); picking one adds it as a tag filter and clears the
// text. ↑ ↓ move through the list, Enter picks (only once you've moved into
// it, so Enter on its own never hijacks a search), Escape closes it.
function SearchBar({ value, onChange, catalog, skipTagIds, onPickTag }) {
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);

  const options = catalog ? tagsForQuery(value, catalog.tags, skipTagIds) : [];
  const open = focused && !dismissed && options.length > 0;

  const pick = (tag) => {
    onPickTag(tag.id);
    onChange('');
    setActive(-1);
  };

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => Math.max(-1, Math.min(options.length - 1, i + step)));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(options[active].tag);
    } else if (e.key === 'Escape') {
      setDismissed(true);
    }
  };

  return (
    <div className="search-bar__wrap">
      <input
        type="text"
        className="search-bar"
        placeholder="Search shops, owners, comments..."
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setDismissed(false);
          setActive(-1);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls="search-tag-options"
        aria-autocomplete="list"
      />
      {open && (
        <ul className="toolbar__menu search-bar__options" id="search-tag-options" role="listbox">
          <li className="toolbar__menu-heading" role="presentation">Filter by tag</li>
          {options.map(({ tag, term }, i) => (
            <li key={tag.id} role="option" aria-selected={i === active}
              className="toolbar__menu-item search-bar__option"
              // mousedown, not click: a click would blur the input and close the list first
              onMouseDown={(e) => { e.preventDefault(); pick(tag); }}
              onMouseEnter={() => setActive(i)}>
              <span className={`tag-chip${tag.color ? '' : ' tag-chip--plain'}`}
                style={tag.color ? { '--tag-color': tag.color } : undefined}>
                {tag.name}
              </span>
              {term !== tag.name && <span className="search-bar__alias">{term}</span>}
              <span className="search-bar__kind">{tag.kind === 'category' ? 'Category' : tag.group}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SearchBar;
