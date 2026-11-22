import { wordDiff } from '../lib/wordDiff';
import './DiffText.css';

// Text with its changes marked: removed words struck through, added words
// highlighted. Color isn't the only cue: there's the strike, and screen
// readers hear "Removed:" and "Added:".
function DiffText({ before, after }) {
  return (
    <p className="diff-text">
      {wordDiff(before ?? '', after ?? '').map((part, i) => (
        part.type === 'removed' ? (
          <del key={i}><span className="visually-hidden">Removed: </span>{part.text}</del>
        ) : part.type === 'added' ? (
          <ins key={i}><span className="visually-hidden">Added: </span>{part.text}</ins>
        ) : part.text
      ))}
    </p>
  );
}

export default DiffText;
