import { Star } from 'lucide-react';
import { toggleFavorite } from '../lib/favorites';
import './StarButton.css';

// Stars a shop (4.7), on its row and its card. A toggle: the label stays
// "Star <name>" and aria-pressed says whether it's on. The click doesn't reach
// the table row (which would open the card). `onToggle(e)`, if given, runs
// after.
function StarButton({ plotId, name, starred, className = '', onToggle }) {
  return (
    <button type="button" className={`star-button ${className}`} aria-pressed={starred} aria-label={`Star ${name}`} title="Star"
      onClick={(e) => { e.stopPropagation(); toggleFavorite(plotId); onToggle?.(e); }}>
      <Star size={16} aria-hidden="true" fill={starred ? 'currentColor' : 'none'} />
    </button>
  );
}

export default StarButton;
