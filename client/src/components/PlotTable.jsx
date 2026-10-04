import { timeAgo } from '../lib/reports';
import './PlotTable.css';

function PlotTable({ plots, searchResults, onSelectPlot }) {
  const rows = searchResults
    ? [...plots].sort((a, b) => {
        const aIndex = searchResults.orderedKeys.indexOf(`${a.x}_${a.z}`);
        const bIndex = searchResults.orderedKeys.indexOf(`${b.x}_${b.z}`);
        const aRank = aIndex === -1 ? Infinity : aIndex;
        const bRank = bIndex === -1 ? Infinity : bIndex;
        return aRank - bRank;
      })
    : plots;

  return (
    <table className="plot-table">
      <thead>
        <tr>
          <th>Owner</th>
          <th>Zone</th>
          <th>Status</th>
          {searchResults && <th>Match</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((plot) => {
          const key = `${plot.x}_${plot.z}`;
          const isMatch = searchResults ? searchResults.matchedKeys.has(key) : true;
          const snippet = searchResults?.snippets[key];

          return (
            <tr
              key={key}
              onClick={() => onSelectPlot(plot)}
              className={searchResults && !isMatch ? 'plot-table__row--dimmed' : ''}
            >
              <td>{plot.owner || '—'}</td>
              <td>{plot.zone || '—'}</td>
              <td>
                {plot.latest_report_type
                  ? `${plot.latest_report_type} ${timeAgo(plot.latest_report_at)}`
                  : '—'}
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