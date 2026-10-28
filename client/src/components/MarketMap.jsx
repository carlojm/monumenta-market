import mapImage from '../assets/market_map.png';
import { plotRect } from '../lib/coordTransform';
import { displayName, statusColor, MAP_CATEGORIES } from '../lib/plots';
import './MarketMap.css';

function MarketMap({ plots, searchResults, selectedId, onSelectPlot }) {
  return (
    <div>
      <div className="market-map">
        <img src={mapImage} alt="Market island map" className="market-map__image" />
        {plots.map((plot) => {
          const dimmed = searchResults && !searchResults.matchedIds.has(plot.id);
          const color = statusColor(plot);
          return (
            <button
              key={plot.id}
              className={[
                'market-map__plot',
                dimmed && 'market-map__plot--dimmed',
                plot.id === selectedId && 'market-map__plot--selected',
              ].filter(Boolean).join(' ')}
              style={{
                ...plotRect(plot.x, plot.z, plot.is_guild),
                '--plot-color': color,
              }}
              onClick={() => onSelectPlot(plot)}
              aria-label={`${displayName(plot.shop)} (${plot.id})`}
              title={`${displayName(plot.shop)} (${plot.id})`}
            />
          );
        })}
      </div>
      <ul className="market-map__legend">
        {MAP_CATEGORIES.map((c) => (
          <li key={c.key}>
            <span className="market-map__swatch" style={{ background: c.color }} />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MarketMap;
