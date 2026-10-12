import { displayName, reportLabel } from '../lib/plots';
import { timeAgo } from '../lib/reports';
import './PlotTable.css';

function PlotTable({ plots, searchResults, onSelectPlot }) {
  const rows = searchResults
    ? [...plots].sort((a, b) => {
        const aIndex = searchResults.orderedIds.indexOf(a.id);
        const bIndex = searchResults.orderedIds.indexOf(b.id);
        const aRank = aIndex === -1 ? Infinity : aIndex;
        const bRank = bIndex === -1 ? Infinity : bIndex;
        return aRank - bRank;
      })
    : plots;

  return (
    <table className="plot-table">
      <thead>
        <tr>
          <th>Shop</th>
          <th>Zone</th>
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
              <td>{displayName(plot.shop)}</td>
              <td>{plot.zone}</td>
              <td>
                {report ? (
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
