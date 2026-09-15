function PlotTable({ plots, onSelectPlot }) {
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
        {plots.map((plot) => (
          <tr key={`${plot.x}_${plot.z}`} onClick={() => onSelectPlot(plot)}>
            <td>{plot.shop_name || '—'}</td>
            <td>{plot.owner || '—'}</td>
            <td>{plot.zone || '—'}</td>
            <td>{plot.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default PlotTable;