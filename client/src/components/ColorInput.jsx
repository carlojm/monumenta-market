// A color field: a swatch that opens the system color picker, plus a text box
// for the hex. Shared by the admin plot editor and the Tags tab.

// "#7bb0e0" or "#7be". Some guild colors are still words from the old notes.
const isHexColor = (v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
// <input type="color"> only takes the 6-digit form.
const toSixDigitHex = (v) => {
  const hex = v.trim();
  return hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex;
};

// `id` goes on the text box, for a <label htmlFor>.
function ColorInput({ id, value, onChange }) {
  const valid = isHexColor(value);
  return (
    <>
      <span className="admin-editor__color">
        {/* A color picker can't be blank, so it's faded when there's no valid color yet. */}
        <input type="color" aria-label="Pick a color" value={valid ? toSixDigitHex(value) : '#000000'}
          className={valid ? undefined : 'admin-editor__color-empty'}
          onChange={(e) => onChange(e.target.value)} />
        <input id={id} type="text" placeholder="#rrggbb" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
      {value.trim() && !valid && (
        <span className="admin-editor__hint admin-editor__hint--warn">
          Not a hex color (like #7bb0e0), so it won't show as a color on the site.
        </span>
      )}
    </>
  );
}

export default ColorInput;
