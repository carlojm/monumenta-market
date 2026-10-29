import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import mapImage from '../assets/market_map.png';
import { plotRect } from '../lib/coordTransform';
import { displayName, statusColor, MAP_CATEGORIES } from '../lib/plots';
import './MarketMap.css';

// Remembered per browser, so someone who prefers the plain map keeps it.
const OVERLAY_KEY = 'map_overlay';

function readOverlaySetting() {
  try {
    return localStorage.getItem(OVERLAY_KEY) !== 'off';
  } catch {
    return true;
  }
}

// `highlightIds`: the plots that match the search and filters (null = all).
function MarketMap({ plots, highlightIds, selectedId, onSelectPlot }) {
  const [showSquares, setShowSquares] = useState(readOverlaySetting);

  const toggleSquares = () => {
    const next = !showSquares;
    setShowSquares(next);
    try {
      localStorage.setItem(OVERLAY_KEY, next ? 'on' : 'off');
    } catch {
      // storage blocked: the setting just won't be remembered
    }
  };

  return (
    <div>
      <div className="market-map">
        <img src={mapImage} alt="Market island map" className="market-map__image" />
        {showSquares && plots.map((plot) => {
          const dimmed = highlightIds && !highlightIds.has(plot.id);
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
      <ul className={`market-map__legend${showSquares ? '' : ' market-map__legend--off'}`}>
        {MAP_CATEGORIES.map((c) => (
          <li key={c.key} className="market-map__legend-item">
            <span className="market-map__swatch" style={{ background: c.color }} />
            {c.label}
          </li>
        ))}
        <li>
          <button type="button" className="market-map__toggle" onClick={toggleSquares} aria-pressed={!showSquares}>
            {showSquares ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
            {showSquares ? 'Hide squares' : 'Show squares'}
          </button>
        </li>
      </ul>
    </div>
  );
}

export default MarketMap;
