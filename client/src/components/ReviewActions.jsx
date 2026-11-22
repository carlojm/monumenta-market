import { useState } from 'react';
import VersionChoice from './VersionChoice';
import { FIELDS, OWNER } from '../lib/shopFields';
import './ReviewActions.css';

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

const EDITABLE = [OWNER, ...FIELDS];

// The text fields a suggestion sets, with the text it sets them to: a new
// shop's filled-in fields, or an edit's changes and clashes. Tags and colors
// aren't editable here; they're applied as suggested.
function editableFields(edit) {
  if (edit.action === 'open') return EDITABLE.filter((f) => edit.proposed[f.key]).map((f) => [f, edit.proposed[f.key]]);
  const set = new Map([...edit.changes.map((c) => [c.field, c.to]), ...edit.conflicts.map((c) => [c.field, c.mine])]);
  return EDITABLE.filter((f) => set.has(f.key)).map((f) => [f, set.get(f.key)]);
}

// Approve or reject one suggestion (on the card for owners and mods, and in
// Admin → Needs review). `edit` is a pending revision with the server's
// preview (`stale`, `conflicts`). `onReviewed('approved' | 'rejected')`.
//   Reject asks for an optional reason first.
//   Approve asks which version to keep where the page changed since in the
//   same fields; otherwise it applies at once.
//   "Edit and approve" opens the suggested text to fix first (a typo, say).
//   Clashing fields still need a version picked; that fills in their text.
//   A suggestion for an earlier shop can only be rejected.
function ReviewActions({ edit, onReviewed }) {
  const [step, setStep] = useState(null); // null | 'reject' | 'resolve' | 'edit'
  const [note, setNote] = useState('');
  const [choices, setChoices] = useState({});
  const [texts, setTexts] = useState({}); // field → text, in the 'edit' step
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const conflicts = edit.conflicts ?? [];
  const fields = edit.stale || edit.action === 'vacate' ? [] : editableFields(edit);
  const clashing = (key) => conflicts.find((c) => c.field === key);

  const send = async (action, body) => {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/revisions/${edit.id}/${action}`, body);
      onReviewed(action === 'approve' ? 'approved' : 'rejected');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const versionText = (c, choice) => (choice === 'mine' ? c.mine : c.theirs) ?? '';

  const approve = () => {
    if (conflicts.length && !step) return setStep('resolve');
    if (conflicts.some((c) => !choices[c.field])) return setError('Choose a version for each field first.');
    const values = Object.fromEntries(conflicts.map((c) => [c.field, versionText(c, choices[c.field])]));
    send('approve', { values: step === 'edit' ? { ...values, ...texts } : values });
  };

  // Clashing fields start empty until a version is picked; the rest start
  // as suggested. A version picked in 'resolve' carries over.
  const startEditing = () => {
    setError(null);
    setTexts(Object.fromEntries(fields.flatMap(([f, text]) => {
      const c = clashing(f.key);
      if (!c) return [[f.key, text ?? '']];
      return choices[f.key] ? [[f.key, versionText(c, choices[f.key])]] : [];
    })));
    setStep('edit');
  };

  const choose = (field, choice) => {
    setError(null);
    setChoices({ ...choices, [field]: choice });
    setTexts({ ...texts, [field]: versionText(clashing(field), choice) });
  };

  const textField = (f) => {
    const id = `review-${edit.id}-${f.key}`;
    const Input = f.multiline ? 'textarea' : 'input';
    return (
      <div className="review-actions__field">
        <label htmlFor={id}>{clashing(f.key) ? 'Text to keep' : f.label}</label>
        <Input id={id} type={f.multiline ? undefined : 'text'} rows={f.multiline ? 4 : undefined} maxLength={f.max}
          value={texts[f.key]} onChange={(e) => setTexts({ ...texts, [f.key]: e.target.value })} />
      </div>
    );
  };

  const back = () => {
    setStep(null);
    setError(null);
  };

  return (
    <div className="review-actions">
      {step === 'resolve' && (
        <>
          <p className="review-actions__muted">The page changed since this was suggested. Choose which version to keep.</p>
          {conflicts.map((c) => (
            <VersionChoice key={c.field} conflict={c} names={['Suggested', 'Current']} value={choices[c.field]}
              onChoose={choose} idPrefix={`review-${edit.id}`} />
          ))}
        </>
      )}
      {step === 'edit' && (
        <>
          <p className="review-actions__muted">Fix anything before approving. Tags are applied as suggested.</p>
          {fields.map(([f]) => {
            const c = clashing(f.key);
            if (!c) return <div key={f.key}>{textField(f)}</div>;
            return (
              <VersionChoice key={f.key} conflict={c} names={['Suggested', 'Current']} value={choices[f.key]}
                onChoose={choose} idPrefix={`review-${edit.id}`}>
                {choices[f.key] && textField(f)}
              </VersionChoice>
            );
          })}
        </>
      )}
      {step === 'reject' && (
        <div className="review-actions__field">
          <label htmlFor={`review-${edit.id}-note`}>
            Reason <span className="review-actions__muted">(optional)</span>
          </label>
          <input id={`review-${edit.id}-note`} type="text" value={note} maxLength={300} autoFocus
            onChange={(e) => setNote(e.target.value)} />
        </div>
      )}

      {error && <p className="review-actions__error" role="alert">{error}</p>}

      <div className="review-actions__buttons">
        {step === 'reject' ? (
          <>
            <button type="button" className="review-actions__reject" onClick={() => send('reject', { note })} disabled={busy}>
              {busy ? 'Rejecting…' : 'Reject'}
            </button>
            <button type="button" onClick={back} disabled={busy}>Cancel</button>
          </>
        ) : (
          <>
            {!edit.stale && (
              <button type="button" className="review-actions__approve" onClick={approve} disabled={busy}>
                {busy ? 'Approving…' : 'Approve'}
              </button>
            )}
            {step !== 'edit' && fields.length > 0 && (
              <button type="button" onClick={startEditing} disabled={busy}>Edit and approve</button>
            )}
            {step ? (
              <button type="button" onClick={back} disabled={busy}>Cancel</button>
            ) : (
              <button type="button" onClick={() => setStep('reject')} disabled={busy}>Reject</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ReviewActions;
