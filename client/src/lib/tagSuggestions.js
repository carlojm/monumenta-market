// Tags suggested from a shop's own text (description + stock): any tag whose
// name or alias appears there as a whole word (a trailing "s" is fine).
//
// Short all-caps aliases ("MR", "EC", "AR") only match in capitals, so they
// don't fire on ordinary words. Best matches first: the tag's full name, then
// long aliases, then short ones.

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isShortCaps = (term) => term.length <= 3 && term === term.toUpperCase();

function termScore(term, tag) {
  if (term === tag.name) return 3;
  return term.length > 3 ? 2 : 1;
}

export function suggestTags(text, tags, skipIds = []) {
  if (!text?.trim()) return [];
  const skip = new Set(skipIds);
  const found = [];
  for (const tag of tags) {
    if (skip.has(tag.id)) continue;
    let best = null;
    for (const term of [tag.name, ...tag.aliases]) {
      const pattern = new RegExp(`(^|[^A-Za-z0-9])${escape(term)}(s|es)?($|[^A-Za-z0-9])`, isShortCaps(term) ? '' : 'i');
      if (!pattern.test(text)) continue;
      const score = termScore(term, tag);
      if (!best || score > best.score || (score === best.score && term.length > best.term.length)) {
        best = { score, term };
      }
    }
    if (best) found.push({ tag, ...best });
  }
  found.sort((a, b) => b.score - a.score || b.term.length - a.term.length);
  return found.map((f) => f.tag);
}
