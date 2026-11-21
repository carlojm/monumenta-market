import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import TagEditor from './TagEditor';
import { wordDiff } from '../lib/wordDiff';
import { displayName } from '../lib/plots';
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

// Typed only for a new shop; an edit can't change the owner.
const OWNER = { key: 'owner', label: 'Owner', max: 32, hint: 'Player name, or the guild tag without brackets.' };

// A plot with no shop, as a snapshot (a new shop is compared against it).
const EMPTY = { ...Object.fromEntries(SHOP_FIELDS.map((f) => [f, null])), tag_ids: [] };

const sameIds = (a, b) => a.length === b.length && a.every((id) => b.includes(id));
const formValues = (snapshot) => Object.fromEntries([OWNER, ...FIELDS].map((f) => [f.key, snapshot[f.key] ?? '']));

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

// Editing a shop in place on its card, in one of three modes:
//   edit    change the current shop's details
//   open    "A new shop is here": a different owner (the current shop closes)
//   vacate  "The plot is now empty": the current shop closes
// A vacant plot starts in `open`. Owners can "Force edit" (publish at once,
// skipping review) their own shop's details; staff can for everything. The
// rest is a suggestion for review. `catalog` is GET /api/tags (App loads it).
// `onDone(result)` gets the server's answer ({ status: 'pending' | 'approved', ... }).
function ShopEditForm({ plot, shop, account, catalog, onDone, onCancel, onDirtyChange }) {
  // What the shop looked like when editing began. The server compares an edit
  // against it, so a change someone else makes meanwhile isn't overwritten.
  const [base] = useState(() => (shop ? {
    ...Object.fromEntries(SHOP_FIELDS.map((f) => [f, shop[f] ?? null])),
    tag_ids: (shop.tags ?? []).map((t) => t.id),
  } : EMPTY));
  const [mode, setMode] = useState(shop ? 'edit' : 'open');
  // Each mode keeps its own draft, so switching back and forth loses nothing.
  const [drafts, setDrafts] = useState(() => ({
    edit: { values: formValues(base), tagIds: base.tag_ids },
    open: { values: formValues(EMPTY), tagIds: [] },
  }));
  const [summary, setSummary] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [showingChanges, setShowingChanges] = useState(false);

  const isStaff = account.role === 'moderator' || account.role === 'admin';
  const isOwner = !!shop && account.name.toLowerCase() === shop.owner.trim().toLowerCase();
  // Matches the server: owners publish edits to their own shop; a new owner
  // or an empty plot always needs a moderator.
  const canPublish = isStaff || (mode === 'edit' && isOwner);

  const fieldsFor = (m) => [...(m === 'open' ? [OWNER] : []), ...FIELDS]
    .filter((f) => !f.guildOnly || plot.is_guild || (m === 'edit' && shop?.guild_name));
  const baseFor = (m) => (m === 'edit' ? base : EMPTY);
  // Blank space at the ends doesn't count: the server trims it off anyway.
  const isEdited = (m, vals, key) => vals[key].trim() !== (baseFor(m)[key] ?? '');
  // "Empty" has nothing to fill in, so nothing to lose.
  const isDirty = (m, d) => m !== 'vacate'
    && (fieldsFor(m).some((f) => isEdited(m, d[m].values, f.key)) || !sameIds(d[m].tagIds, baseFor(m).tag_ids));

  const fields = fieldsFor(mode);
  const { values, tagIds } = drafts[mode] ?? { values: {}, tagIds: [] };
  const edited = (key) => isEdited(mode, values, key);
  const tagsEdited = mode !== 'vacate' && !sameIds(tagIds, baseFor(mode).tag_ids);
  const dirty = isDirty(mode, drafts);

  // The card (which asks before closing) and the browser's leave warning
  // hear about every change as it happens.
  const report = (m, d) => {
    const nextDirty = isDirty(m, d);
    onDirtyChange(nextDirty);
    leaveWarning(nextDirty);
  };
  const change = (nextValues, nextTagIds) => {
    const next = { ...drafts, [mode]: { values: nextValues, tagIds: nextTagIds } };
    setDrafts(next);
    setError(null); // an error about the last send no longer applies
    report(mode, next);
  };
  const set = (key) => (e) => change({ ...values, [key]: e.target.value }, tagIds);
  const reset = (key) => () => change({ ...values, [key]: base[key] ?? '' }, tagIds);
  const setTags = (ids) => change(values, ids);

  const switchMode = (m) => {
    setMode(m);
    setShowingChanges(false);
    setConfirmingCancel(false);
    setError(null);
    report(m, drafts);
  };

  const submit = async (requestReview) => {
    if (mode !== 'vacate' && !dirty) return setError("You haven't changed anything yet.");
    if (mode === 'open' && !values.owner.trim()) return setError('A new shop needs an owner.');
    setSending(true);
    setError(null);
    const body = mode === 'edit'
      ? { action: 'edit', base, proposed: { ...base, ...values, tag_ids: tagIds } }
      : mode === 'open'
        ? { action: 'open', proposed: { ...values, tag_ids: tagIds } }
        : { action: 'vacate' };
    try {
      const res = await fetch(`/api/plots/${plot.id}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, summary, request_review: requestReview }),
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
  const tagName = (id) => catalog?.tags.find((t) => t.id === id)?.name ?? shop?.tags?.find((t) => t.id === id)?.name ?? `#${id}`;
  const modeBase = baseFor(mode);
  const changes = showingChanges
    ? fields.filter((f) => edited(f.key)).map((f) => ({ ...f, parts: wordDiff(modeBase[f.key] ?? '', values[f.key].trim()) }))
    : [];
  const addedTags = showingChanges ? tagIds.filter((id) => !modeBase.tag_ids.includes(id)).map(tagName) : [];
  const removedTags = showingChanges ? modeBase.tag_ids.filter((id) => !tagIds.includes(id)).map(tagName) : [];

  const title = { edit: canPublish ? 'Editing' : 'Suggesting an edit', open: 'A new shop is here', vacate: 'The plot is now empty' }[mode];
  const reviewer = mode === 'edit' ? 'The owner or a moderator' : 'A moderator';

  return (
    // Buttons send the edit, not the Enter key: Enter in a one-line field
    // (like the tag search) shouldn't send it half done.
    <form className="shop-edit" aria-labelledby="shop-edit-title" onSubmit={(e) => e.preventDefault()}
      ref={warningOffOnUnmount}>
      <div className="shop-edit__mode">
        {/* A new heading per mode, so focus moves to it when the mode changes. */}
        <h3 id="shop-edit-title" key={mode} ref={focusOnMount} tabIndex={-1}>{title}</h3>
        {!canPublish && <p className="shop-edit__muted">{reviewer} reviews it before it shows.</p>}
      </div>

      {shop && (
        mode === 'edit' ? (
          <div className="shop-edit__modes">
            <span className="shop-edit__muted">Not the same shop anymore?</span>
            <button type="button" className="shop-edit__toggle" onClick={() => switchMode('vacate')}>
              The plot is now empty
            </button>
            <button type="button" className="shop-edit__toggle" onClick={() => switchMode('open')}>
              A new shop is here
            </button>
          </div>
        ) : (
          <>
            <p className="shop-edit__warning">
              {displayName(shop)} closes and moves to Past shops, with its comments.
            </p>
            <button type="button" className="shop-edit__toggle" onClick={() => switchMode('edit')}>
              Edit {displayName(shop)} instead
            </button>
          </>
        )
      )}

      {mode === 'vacate' ? null : showingChanges ? (
        <ChangesView changes={changes} addedTags={addedTags} removedTags={removedTags} />
      ) : (
        <>
          {mode === 'edit' && (
            <div className="shop-edit__field">
              <span className="shop-edit__label-row">Owner</span>
              <p className="shop-edit__readonly">{shop.owner}</p>
            </div>
          )}

          {fields.map((f) => {
            const id = `shop-edit-${f.key}`;
            const Input = f.multiline ? 'textarea' : 'input';
            // A new shop starts empty, so "Edited" would be on everything.
            const marked = mode === 'edit' && edited(f.key);
            return (
              <div className="shop-edit__field" key={f.key}>
                <FieldLabel htmlFor={id} label={f.label} edited={marked} onReset={reset(f.key)} />
                <Input id={id} type={f.multiline ? undefined : 'text'} value={values[f.key]} onChange={set(f.key)}
                  maxLength={f.max} aria-describedby={f.hint ? `${id}-hint` : undefined}
                  aria-required={f.key === 'owner' || undefined}
                  className={marked ? 'shop-edit__input--edited' : undefined} />
                {f.hint && <p id={`${id}-hint`} className="shop-edit__muted">{f.hint}</p>}
              </div>
            );
          })}

          <div className="shop-edit__field" role="group" aria-labelledby="shop-edit-tags-label">
            <FieldLabel labelId="shop-edit-tags-label" label="Tags" edited={mode === 'edit' && tagsEdited}
              onReset={() => setTags(base.tag_ids)} />
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
          {mode === 'edit' ? 'What did you change?' : 'How do you know?'}{' '}
          <span className="shop-edit__muted">(optional)</span>
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
