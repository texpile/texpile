// The interior tier's second half, answered by the ENGINE: did the edit change the band's
// own output at all? Comparing the daemon's typeset of the old block against the new one --
// glyph for glyph, line box for line box -- separates content from consumed values with no
// vocabulary: type into \emph{} and ink appears; change \gdef\ver{2.0} to {3.0} or an
// \index term and the band is identical, so the edit's ONLY effect is elsewhere and the
// full pass is the only honest render. Engine output against engine output, so ligatures,
// kerning, and hyphenation never mislead it the way a character diff would.
type Rec = Record<string, unknown>;

const keep = (r: Rec): string | null => {
	if (r.t === 'g') return `g${r.c}/${r.f}@${r.x},${r.y}`;
	if (r.t === 'line') return `l${r.n}@${r.x},${r.y}:${r.w},${r.h},${r.d}`;
	if (r.t === 'rule' || r.t === 'image') return `${r.t}@${r.x},${r.y}:${r.w},${r.h}`;
	return null;
};

export function bandChanged(oldRecs: Rec[], newRecs: Rec[]): boolean {
	const a = oldRecs.map(keep).filter(Boolean);
	const b = newRecs.map(keep).filter(Boolean);
	return a.length !== b.length || a.some((s, i) => s !== b[i]);
}
