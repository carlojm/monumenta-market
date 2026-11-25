import { memo } from 'react';
import { displayName, reportLabel } from '../lib/plots';
import { timeAgo } from '../lib/reports';
import StarButton from './StarButton';
import './PlotTable.css';

function Snippet({ snippet }) {
  return (
    <div>
      <span className="plot-table__match-field">{snippet.field}: </span>
      {snippet.before}
      <mark>{snippet.highlight}</mark>
      {snippet.after}
    </div>
  );
}

// `rows` arrive already sorted (see lib/sort.js). `tagMatches` (plot id ->
// { names, context }) is set while a tag filter is on; the Match column shows
// the matching tags, then where they appear in the shop's text. A search
// snippet, if any, comes first instead.
// The third column depends on what's narrowing the list: searching shows
// where the text matched; a tag filter alone (any kind, "has none of" too)
// shows what each shop says it is (About, cut to 3 lines); otherwise, the zone.
// `starred`: the starred plot ids; each shop's row has a star button.
function PlotTable({ rows, searchResults, tagMatches, tagFiltering, starred, onSelectPlot }) {
  const third = searchResults ? 'match' : tagFiltering ? 'about' : 'zone';
  // Icons get a column once any shop listed has one; the others keep its space.
  const icons = rows.some((plot) => plot.shop?.icon);
  return (
    <table className="plot-table">
      <thead>
        <tr>
          <th className="plot-table__shop">Shop</th>
          {third === 'zone' && <th>Zone</th>}
          <th>Status</th>
          {third === 'match' && <th>Match</th>}
          {third === 'about' && <th>About</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((plot) => {
          const isMatch = searchResults ? searchResults.matchedIds.has(plot.id) : true;
          const snippet = searchResults?.snippets[plot.id];
          const tagNames = tagMatches?.[plot.id]?.names ?? [];
          const context = snippet ? null : tagMatches?.[plot.id]?.context;
          const report = plot.latest_report;

          return (
            <tr
              key={plot.id}
              onClick={() => onSelectPlot(plot)}
              className={[
                searchResults && !isMatch && 'plot-table__row--dimmed',
                !plot.shop && 'plot-table__row--vacant',
              ].filter(Boolean).join(' ')}
            >
              {/* The row is clickable; this button is how the keyboard (and screen
                  readers) open it. data-plot-id lets the page return focus here. */}
              <td className="plot-table__shop">
                <div className="plot-table__shop-cell">
                  {/* Stars in one column; a vacant plot keeps the space, so names line up. */}
                  {plot.shop
                    ? <StarButton plotId={plot.id} name={displayName(plot.shop)} starred={starred.has(plot.id)} />
                    : <span className="plot-table__no-star" />}
                  {icons && (plot.shop?.icon
                    ? <img className="plot-table__icon" src={plot.shop.icon} alt="" width={24} height={24} loading="lazy" />
                    : <span className="plot-table__icon" />)}
                  <button type="button" className="plot-table__open" data-plot-id={plot.id}
                    onClick={(e) => { e.stopPropagation(); onSelectPlot(plot); }}>
                    {displayName(plot.shop)}
                  </button>
                </div>
              </td>
              {third === 'zone' && <td>{plot.zone}</td>}
              <td>
                {!plot.shop ? 'Vacant' : report ? (
                  <>
                    {reportLabel(report)}{' '}
                    <span className="plot-table__age">{timeAgo(report.created_at)}</span>
                  </>
                ) : '—'}
              </td>
              {third === 'about' && (
                // Cut to 3 lines by CSS only, so the whole text is still there
                // for Find in page and screen readers.
                <td><div className="plot-table__about">{plot.shop?.description || '—'}</div></td>
              )}
              {third === 'match' && (
                <td className="plot-table__match">
                  {snippet && <Snippet snippet={snippet} />}
                  {tagNames.length > 0 && (
                    <div>
                      <span className="plot-table__match-field">Tags: </span>
                      {tagNames.map((name, i) => (
                        <span key={name}>{i > 0 && ', '}<mark>{name}</mark></span>
                      ))}
                    </div>
                  )}
                  {context && <Snippet snippet={context} />}
                  {!snippet && tagNames.length === 0 && '—'}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// memo: skipped when its props haven't changed (App, while typing a search).
export default memo(PlotTable);
