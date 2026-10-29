import { displayName, reportLabel } from '../lib/plots';
import { timeAgo } from '../lib/reports';
import './PlotTable.css';

// `rows` arrive already sorted (see lib/sort.js).
function PlotTable({ rows, searchResults, onSelectPlot }) {
  return (
    <table className="plot-table">
      <thead>
        <tr>
          <th className="plot-table__shop">Shop</th>
          {/* Zone only without a search, so the Match column gets the room. */}
          {!searchResults && <th>Zone</th>}
          <th>Status</th>
          {searchResults && <th>Match</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((plot) => {
          const isMatch = searchResults ? searchResults.matchedIds.has(plot.id) : true;
          const snippet = searchResults?.snippets[plot.id];
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
              <td className="plot-table__shop">{displayName(plot.shop)}</td>
              {!searchResults && <td>{plot.zone}</td>}
              <td>
                {!plot.shop ? 'Vacant' : report ? (
                  <>
                    {reportLabel(report)}{' '}
                    <span className="plot-table__age">{timeAgo(report.created_at)}</span>
                  </>
                ) : '—'}
              </td>
              {searchResults && (
                <td className="plot-table__match">
                  {snippet ? (
                    <>
                      <span className="plot-table__match-field">{snippet.field}: </span>
                      {snippet.before}
                      <mark>{snippet.highlight}</mark>
                      {snippet.after}
                    </>
                  ) : (
                    '—'
                  )}
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
