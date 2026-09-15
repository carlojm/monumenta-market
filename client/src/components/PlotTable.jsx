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
          <th>Shop</th>
          <th>Owner</th>
          <th>Zone</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((plot) => {
          const key = `${plot.x}_${plot.z}`;
          const isMatch = searchResults ? searchResults.matchedKeys.has(key) : true;
          return (
            <tr
              key={key}
              onClick={() => onSelectPlot(plot)}
              className={searchResults && !isMatch ? 'plot-table__row--dimmed' : ''}
            >
              <td>{plot.shop_name || '—'}</td>
              <td>{plot.owner || '—'}</td>
              <td>{plot.zone || '—'}</td>
              <td>{plot.status}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default PlotTable;