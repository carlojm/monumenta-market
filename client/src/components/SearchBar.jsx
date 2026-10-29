import { tagsForQuery } from '../lib/tagSuggestions';
import './TagChips.css';
import './Toolbar.css';

function SearchBar({ value, onChange }) {
  return (
    <input
      type="text"
      className="search-bar"
      placeholder="Search shops, owners, comments..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// A line under the search bar while typing: tags matching the text ("white" ->
// Halls of Wind and Blood). Picking one adds it as a tag filter and clears the
// text. It sits in the page (pushing the table down) rather than over it.
export function SearchTagSuggestions({ query, catalog, skipTagIds, onPick }) {
  const options = catalog ? tagsForQuery(query, catalog.tags, skipTagIds) : [];
  if (options.length === 0) return null;
  return (
    <div className="search-tags">
      <span className="search-tags__label">Filter by tag:</span>
      <ul className="tag-chips">
        {options.map(({ tag, term }) => (
          <li key={tag.id}>
            <button type="button" onClick={() => onPick(tag.id)}
              className={`tag-chip search-tags__chip${tag.color ? '' : ' tag-chip--plain'}`}
              style={tag.color ? { '--tag-color': tag.color } : undefined}
              title={tag.kind === 'category' ? 'Category' : tag.group}>
              + {tag.name}
              {term !== tag.name && <span className="search-tags__alias">{term}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SearchBar;
