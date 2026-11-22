import { labelOf } from '../lib/shopFields';
import './VersionChoice.css';

// One field that two people changed: pick a version. `conflict` is the
// server's { field, mine, theirs }; `names` labels them, like ['Yours', 'Current'].
// Native radios in a fieldset, so it's read as "About, Yours, radio button".
// `children` go inside the fieldset, after the choices.
function VersionChoice({ conflict, names, value, onChoose, idPrefix, children }) {
  const options = [['mine', names[0], conflict.mine], ['theirs', names[1], conflict.theirs]];
  return (
    <fieldset className="version-choice">
      <legend>{labelOf(conflict.field)}</legend>
      {options.map(([key, name, text]) => (
        <label className="version-choice__option" key={key}>
          <input type="radio" name={`${idPrefix}-${conflict.field}`} checked={value === key}
            onChange={() => onChoose(conflict.field, key)} />
          <span className="version-choice__name">{name}</span>
          <span className="version-choice__text">{text ?? <span className="version-choice__empty">(empty)</span>}</span>
        </label>
      ))}
      {children}
    </fieldset>
  );
}

export default VersionChoice;
