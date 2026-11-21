import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import TagEditor from './TagEditor';
import { wordDiff } from '../lib/wordDiff';
import './ShopEditForm.css';

// Every field of a shop, as the server's revisions expect (server/lib/shops.js).
const SHOP_FIELDS = ['owner', 'shop_name', 'guild_name', 'description', 'stock', 'palette',
  'guild_color', 'primary_color', 'secondary_color'];

// The fields players edit here, in card order. Lengths match the server's
// limits. The colors are left to the admin editor: the site doesn't show them.
const FIELDS = [
  { key: 'shop_name', label: 'Shop name', max: 80, hint: "Leave blank to use the owner's name." },
  { key: 'guild_name', label: 'Guild name', max: 80, guildOnly: true },
  { key: 'description', label: 'About', max: 4000, multiline: true },
  { key: 'stock', label: 'Keywords', max: 4000, multiline: true, hint: 'What the shop sells. Search looks here.' },
  { key: 'palette', label: 'Palette', max: 200 },
];

const sameIds = (a, b) => a.length === b.length && a.every((id) => b.includes(id));

// Closing or reloading the tab with unsaved edits asks the browser to confirm.
// Turned on and off as the form changes, and off when the form goes away.
const warnBeforeLeaving = (e) => {
  e.preventDefault();
  e.returnValue = ''; // some browsers only prompt when this is set
};
const leaveWarning = (on) => (on ? window.addEventListener : window.removeEventListener)('beforeunload', warnBeforeLeaving);

// Ref callbacks, defined out here so React sees the same function every
// render and calls them only when the element appears (and its cleanup when
// it goes). Start at the top of the form, so screen readers hear which mode
// this is; drop the leave warning when the form closes, however it closes.
const focusOnMount = (el) => { el?.focus(); };
const warningOffOnUnmount = () => () => leaveWarning(false);

// One field's label row: the name, and once it's changed, "Edited" with a
// button that puts the original back.
function FieldLabel({ htmlFor, labelId, label, edited, onReset }) {
  return (
    <div className="shop-edit__label-row">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span id={labelId}>{label}</span>}
      {edited && (
        <span className="shop-edit__edited">
          Edited
          <button type="button" className="shop-edit__reset" onClick={onReset} aria-label={`Undo changes to ${label}`}
            title="Undo changes">
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  );
}

// "Show changes": only the changed fields, with removed words struck through
// and added words highlighted. Screen readers hear "Removed:" and "Added:".
function ChangesView({ changes, addedTags, removedTags }) {
  return (
    <div className="shop-edit__changes">
      {changes.map((f) => (
        <div className="shop-edit__field" key={f.key}>
          <span className="shop-edit__label-row">{f.label}</span>
          <p className="shop-edit__diff">
            {f.parts.map((part, i) => (
              part.type === 'removed' ? (
                <del key={i}><span className="visually-hidden">Removed: </span>{part.text}</del>
              ) : part.type === 'added' ? (
                <ins key={i}><span className="visually-hidden">Added: </span>{part.text}</ins>
              ) : part.text
            ))}
          </p>
        </div>
      ))}
      {(addedTags.length > 0 || removedTags.length > 0) && (
        <div className="shop-edit__field">
          <span className="shop-edit__label-row">Tags</span>
          {addedTags.length > 0 && <p className="shop-edit__diff">Added <ins>{addedTags.join(', ')}</ins></p>}
          {removedTags.length > 0 && <p className="shop-edit__diff">Removed <del>{removedTags.join(', ')}</del></p>}
        </div>
      )}
    </div>
  );
}

// Editing a shop in place on its card. Owners (their own shop) and staff can
// "Force edit" (publish at once, skipping review); everyone else's edit is a
// suggestion for review.
// `catalog` is GET /api/tags (App loads it). `onDone(result)` gets the server's
// answer ({ status: 'pending' | 'approved', ... }).
function ShopEditForm({ plot, shop, account, catalog, onDone, onCancel, onDirtyChange }) {
  // What the shop looked like when editing began. The server compares against
  // it, so a change someone else makes meanwhile isn't overwritten.
  const [base] = useState(() => ({
    ...Object.fromEntries(SHOP_FIELDS.map((f) => [f, shop[f] ?? null])),
    tag_ids: (shop.tags ?? []).map((t) => t.id),
  }));
  const [values, setValues] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.key, base[f.key] ?? ''])));
  const [tagIds, setTagIds] = useState(base.tag_ids);
  const [summary, setSummary] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [showingChanges, setShowingChanges] = useState(false);

  const isStaff = account.role === 'moderator' || account.role === 'admin';
  const isOwner = account.name.toLowerCase() === shop.owner.trim().toLowerCase();
  const canPublish = isStaff || isOwner;
  const fields = FIELDS.filter((f) => !f.guildOnly || plot.is_guild || shop.guild_name);

  // Blank space at the ends doesn't count: the server trims it off anyway.
  const isEdited = (vals, key) => vals[key].trim() !== (base[key] ?? '');
  const isDirty = (vals, ids) => fields.some((f) => isEdited(vals, f.key)) || !sameIds(ids, base.tag_ids);
  const edited = (key) => isEdited(values, key);
  const tagsEdited = !sameIds(tagIds, base.tag_ids);
  const dirty = isDirty(values, tagIds);

  // Every change goes through here, so the card (which asks before closing)
  // and the browser's leave warning hear about it as it happens.
  const change = (nextValues, nextTagIds) => {
    setValues(nextValues);
    setTagIds(nextTagIds);
    setError(null); // an error about the last send no longer applies
    const nextDirty = isDirty(nextValues, nextTagIds);
    onDirtyChange(nextDirty);
    leaveWarning(nextDirty);
  };
  const set = (key) => (e) => change({ ...values, [key]: e.target.value }, tagIds);
  const reset = (key) => () => change({ ...values, [key]: base[key] ?? '' }, tagIds);
  const setTags = (ids) => change(values, ids);

  const submit = async (requestReview) => {
    if (!dirty) return setError("You haven't changed anything yet.");
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/plots/${plot.id}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          base,
          proposed: { ...base, ...values, tag_ids: tagIds },
          summary,
          request_review: requestReview,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save your edit. Please try again.');
      onDone(data);
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  const cancel = () => (dirty ? setConfirmingCancel(true) : onCancel());

  // For "Show changes", worked out only while it's open.
  const tagName = (id) => catalog?.tags.find((t) => t.id === id)?.name ?? shop.tags?.find((t) => t.id === id)?.name ?? `#${id}`;
  const changes = showingChanges
    ? fields.filter((f) => edited(f.key)).map((f) => ({ ...f, parts: wordDiff(base[f.key] ?? '', values[f.key].trim()) }))
    : [];
  const addedTags = showingChanges ? tagIds.filter((id) => !base.tag_ids.includes(id)).map(tagName) : [];
  const removedTags = showingChanges ? base.tag_ids.filter((id) => !tagIds.includes(id)).map(tagName) : [];

  return (
    // Buttons send the edit, not the Enter key: Enter in a one-line field
    // (like the tag search) shouldn't send it half done.
    <form className="shop-edit" aria-labelledby="shop-edit-title" onSubmit={(e) => e.preventDefault()}
      ref={warningOffOnUnmount}>
      <div className="shop-edit__mode">
        <h3 id="shop-edit-title" ref={focusOnMount} tabIndex={-1}>
          {canPublish ? 'Editing' : 'Suggesting an edit'}
        </h3>
        {!canPublish && (
          <p className="shop-edit__muted">The owner or a moderator reviews it before it shows.</p>
        )}
      </div>

      {showingChanges ? (
        <ChangesView changes={changes} addedTags={addedTags} removedTags={removedTags} />
      ) : (
        <>
          <div className="shop-edit__field">
            <span className="shop-edit__label-row">Owner</span>
            <p className="shop-edit__readonly">{shop.owner}</p>
          </div>

          {fields.map((f) => {
            const id = `shop-edit-${f.key}`;
            const Input = f.multiline ? 'textarea' : 'input';
            return (
              <div className="shop-edit__field" key={f.key}>
                <FieldLabel htmlFor={id} label={f.label} edited={edited(f.key)} onReset={reset(f.key)} />
                <Input id={id} type={f.multiline ? undefined : 'text'} value={values[f.key]} onChange={set(f.key)}
                  maxLength={f.max} aria-describedby={f.hint ? `${id}-hint` : undefined}
                  className={edited(f.key) ? 'shop-edit__input--edited' : undefined} />
                {f.hint && <p id={`${id}-hint`} className="shop-edit__muted">{f.hint}</p>}
              </div>
            );
          })}

          <div className="shop-edit__field" role="group" aria-labelledby="shop-edit-tags-label">
            <FieldLabel labelId="shop-edit-tags-label" label="Tags" edited={tagsEdited} onReset={() => setTags(base.tag_ids)} />
            <TagEditor catalog={catalog} plotId={plot.id} value={tagIds} onChange={setTags}
              text={`${values.description}\n${values.stock}`} />
          </div>
        </>
      )}

      {/* The same button both ways, so focus stays on it. */}
      {dirty && (
        <button type="button" className="shop-edit__toggle" onClick={() => setShowingChanges((v) => !v)}
          aria-expanded={showingChanges}>
          {showingChanges ? 'Back to editing' : 'Show changes'}
        </button>
      )}

      <div className="shop-edit__field">
        <label htmlFor="shop-edit-summary">
          What did you change? <span className="shop-edit__muted">(optional)</span>
        </label>
        <input id="shop-edit-summary" type="text" value={summary} maxLength={300}
          onChange={(e) => setSummary(e.target.value)} />
      </div>

      {error && <p className="shop-edit__error" role="alert">{error}</p>}

      {confirmingCancel ? (
        <div className="shop-edit__actions">
          <span className="shop-edit__muted">Discard your changes?</span>
          <button type="button" onClick={onCancel}>Discard</button>
          {/* Focus starts on the safe choice. */}
          <button type="button" autoFocus onClick={() => setConfirmingCancel(false)}>Keep editing</button>
        </div>
      ) : (
        <div className="shop-edit__actions">
          {canPublish ? (
            <>
              <button type="button" className="shop-edit__primary" onClick={() => submit(false)} disabled={sending}>
                {sending ? 'Saving…' : 'Force edit'}
              </button>
              <button type="button" onClick={() => submit(true)} disabled={sending}>Suggest edit</button>
            </>
          ) : (
            <button type="button" className="shop-edit__primary" onClick={() => submit(false)} disabled={sending}>
              {sending ? 'Sending…' : 'Suggest edit'}
            </button>
          )}
          <button type="button" onClick={cancel} disabled={sending}>Cancel</button>
        </div>
      )}
    </form>
  );
}

export default ShopEditForm;
