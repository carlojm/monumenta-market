// Tags suggested from a shop's own text (description + stock): any tag whose
// name or alias appears there as a whole word (a trailing "s" is fine).
//
// Short all-caps aliases ("MR", "EC", "AR") only match in capitals, so they
// don't fire on ordinary words. Best matches first: the tag's full name, then
// long aliases, then short ones.

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isShortCaps = (term) => term.length <= 3 && term === term.toUpperCase();
const termPattern = (term) =>
  new RegExp(`(^|[^A-Za-z0-9])${escape(term)}(s|es)?($|[^A-Za-z0-9])`, isShortCaps(term) ? '' : 'i');

function termScore(term, tag) {
  if (term === tag.name) return 3;
  return term.length > 3 ? 2 : 1;
}

export function suggestTags(text, tags, skipIds = []) {
  return matchTags(text, tags, skipIds).map((m) => m.tag);
}

// The same, with what matched: [{ tag, term, score }]. Score 3 is the tag's
// full name, 2 a long alias, 1 a short alias.
export function matchTags(text, tags, skipIds = []) {
  if (!text?.trim()) return [];
  const skip = new Set(skipIds);
  const found = [];
  for (const tag of tags) {
    if (skip.has(tag.id)) continue;
    let best = null;
    for (const term of [tag.name, ...tag.aliases]) {
      if (!termPattern(term).test(text)) continue;
      const score = termScore(term, tag);
      if (!best || score > best.score || (score === best.score && term.length > best.term.length)) {
        best = { score, term };
      }
    }
    if (best) found.push({ tag, ...best });
  }
  found.sort((a, b) => b.score - a.score || b.term.length - a.term.length);
  return found;
}

// Where a tag's name or alias first appears in `text`: { start, end } or null.
export function findTerm(text, tag) {
  if (!text) return null;
  let first = null;
  for (const term of [tag.name, ...tag.aliases]) {
    const m = termPattern(term).exec(text);
    if (!m) continue;
    const start = m.index + m[1].length;
    if (!first || start < first.start) first = { start, end: start + term.length + (m[2]?.length ?? 0) };
  }
  return first;
}

// Tags for what's typed in the search bar: [{ tag, term }], best first. An exact
// name or alias, then ones starting with the text, then a word starting with
// it, then containing it. `term` is the alias that matched (or the name).
export function tagsForQuery(query, tags, skipIds = [], limit = 5) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const skip = new Set(skipIds);
  const rank = (term) => {
    const t = term.toLowerCase();
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    if (t.split(/[^a-z0-9']+/).some((w) => w.startsWith(q))) return 2;
    return t.includes(q) ? 3 : null;
  };
  const found = [];
  for (const tag of tags) {
    if (skip.has(tag.id)) continue;
    let best = null;
    for (const term of [tag.name, ...tag.aliases]) {
      const r = rank(term);
      if (r !== null && (!best || r < best.rank)) best = { rank: r, term };
    }
    if (best) found.push({ tag, ...best });
  }
  found.sort((a, b) => a.rank - b.rank || (a.term === a.tag.name ? -1 : 0) - (b.term === b.tag.name ? -1 : 0));
  return found.slice(0, limit);
}
