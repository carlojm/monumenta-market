import mapImage from '../assets/market_map.png';
import { plotRect } from '../lib/coordTransform';
import { displayName, statusColor, STATUS_COLORS, ACTIVITY_LABELS } from '../lib/plots';
import './MarketMap.css';

const LEGEND = ['active', 'inactive', 'wip', 'unclear'];

function MarketMap({ plots, searchResults, onSelectPlot }) {
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
                !plot.shop && 'market-map__plot--vacant',
                dimmed && 'market-map__plot--dimmed',
              ].filter(Boolean).join(' ')}
              style={{
                ...plotRect(plot.x, plot.z, plot.is_guild),
                '--plot-color': plot.shop ? color : 'transparent',
              }}
              onClick={() => onSelectPlot(plot)}
              aria-label={`${displayName(plot.shop)} (${plot.id})`}
              title={`${displayName(plot.shop)} · ${plot.id}`}
            />
          );
        })}
      </div>
      <ul className="market-map__legend">
        {LEGEND.map((key) => (
          <li key={key}>
            <span className="market-map__swatch" style={{ background: STATUS_COLORS[key] }} />
            {ACTIVITY_LABELS[key]}
          </li>
        ))}
        <li>
          <span className="market-map__swatch market-map__swatch--vacant" />
          Vacant
        </li>
      </ul>
    </div>
  );
}

export default MarketMap;
