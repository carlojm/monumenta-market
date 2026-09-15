import mapImage from '../assets/market_map.png';
import { gameToPercent } from '../lib/coordTransform';
import './MarketMap.css';

const STATUS_COLORS = {
  active: '#4a7c4a',
  closed: '#8a8a8a',
  locked: '#b0902a',
  unclear: '#666666',
};

function MarketMap({ plots, onSelectPlot }) {
  return (
    <div className="market-map">
      <img src={mapImage} alt="Market island map" className="market-map__image" />
      {plots.map((plot) => {
        const pos = gameToPercent(plot.x, plot.z);
        const size = plot.is_guild ? '5%' : '3.5%';
        return (
          <button
            key={`${plot.x}_${plot.z}`}
            className="market-map__plot"
            style={{
              left: pos.left,
              top: pos.top,
              width: size,
              height: size,
              backgroundColor: STATUS_COLORS[plot.status] || STATUS_COLORS.unclear,
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