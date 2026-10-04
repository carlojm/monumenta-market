import mapImage from '../assets/market_map.png';
import { gameToPercent } from '../lib/coordTransform';
import './MarketMap.css';

const STATUS_COLORS = {
  active: '#4a7c4a',
  closed: '#8a8a8a',
  locked: '#b0902a',
  unclear: '#666666',
};

function MarketMap({ plots, searchResults, onSelectPlot }) {
  return (
    <div className="market-map">
      <img src={mapImage} alt="Market island map" className="market-map__image" />
      {plots.map((plot) => {
        const key = `${plot.x}_${plot.z}`;
        const pos = (plot.map_x_pct != null && plot.map_z_pct != null)
          ? { left: `${plot.map_x_pct}%`, top: `${plot.map_z_pct}%` }
          : gameToPercent(plot.x, plot.z);
        const size = plot.is_guild ? '5%' : '3.5%';

        let opacity = 0.9;
        if (searchResults) {
            opacity = searchResults.matchedKeys.has(key) ? 1 : 0.15;
        }

        return (
          <button
            key={key}
            className="market-map__plot"
            style={{
              left: pos.left,
              top: pos.top,
              width: size,
              height: size,
              backgroundColor: STATUS_COLORS[plot.status] || STATUS_COLORS.unclear,
              opacity,
            }}
            onClick={() => onSelectPlot(plot)}
            aria-label={plot.shop_name || plot.owner || `Plot ${plot.x}, ${plot.z}`}
          />
        );
      })}
    </div>
  );
}

export default MarketMap;