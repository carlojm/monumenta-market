import { displayName, reportLabel } from '../lib/plots';
import { timeAgo } from '../lib/reports';
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
function PlotTable({ rows, searchResults, tagMatches, onSelectPlot }) {
  const showMatch = !!(searchResults || tagMatches);
  return (
    <table className="plot-table">
      <thead>
        <tr>
          <th className="plot-table__shop">Shop</th>
          {/* Zone only without a search or filter, so the Match column gets the room. */}
          {!showMatch && <th>Zone</th>}
          <th>Status</th>
          {showMatch && <th>Match</th>}
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
                <button type="button" className="plot-table__open" data-plot-id={plot.id}
                  onClick={(e) => { e.stopPropagation(); onSelectPlot(plot); }}>
                  {displayName(plot.shop)}
                </button>
              </td>
              {!showMatch && <td>{plot.zone}</td>}
              <td>
                {!plot.shop ? 'Vacant' : report ? (
                  <>
                    {reportLabel(report)}{' '}
                    <span className="plot-table__age">{timeAgo(report.created_at)}</span>
                  </>
                ) : '—'}
              </td>
              {showMatch && (
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

export default PlotTable;
