// Word-level differences between two texts, for "Show changes" in the shop
// edit form: [{ type: 'same' | 'removed' | 'added', text }].
//
// The text is split into words and the spaces between them, then compared
// with the classic longest-common-subsequence method: keep as many words in
// common as possible; the rest were removed or added. Fields are at most 4000
// characters, and the unchanged start and end are skipped first, so the table
// stays small.

const tokens = (text) => text.match(/\s+|\S+/g) ?? [];

export function wordDiff(before, after) {
  const a = tokens(before ?? '');
  const b = tokens(after ?? '');

  // The unchanged start and end don't need the table.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const midA = a.slice(start, endA), midB = b.slice(start, endB);

  // lcs[i][j]: how many tokens midA[i..] and midB[j..] have in common.
  const n = midA.length, m = midB.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const parts = a.slice(0, start).map((text) => ({ type: 'same', text }));
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && midA[i] === midB[j]) { parts.push({ type: 'same', text: midA[i] }); i++; j++; }
    else if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) parts.push({ type: 'removed', text: midA[i++] });
    else parts.push({ type: 'added', text: midB[j++] });
  }
  parts.push(...a.slice(endA).map((text) => ({ type: 'same', text })));
  return group(parts);
}

// Reads better as "~~the cat~~ a dog" than "~~the~~ a ~~cat~~ dog": a space
// kept between two changes joins them, and each run of changes shows all its
// removed text, then all its added text.
function group(parts) {
  const out = [];
  let removed = '', added = '';
  const flush = () => {
    if (removed) out.push({ type: 'removed', text: removed });
    if (added) out.push({ type: 'added', text: added });
    removed = added = '';
  };
  parts.forEach((p, k) => {
    const between = p.type === 'same' && /^\s+$/.test(p.text)
      && parts[k - 1] && parts[k - 1].type !== 'same' && parts[k + 1] && parts[k + 1].type !== 'same';
    if (between) { removed += p.text; added += p.text; }
    else if (p.type === 'removed') removed += p.text;
    else if (p.type === 'added') added += p.text;
    else { flush(); out.push(p); }
  });
  flush();
  return out;
}
