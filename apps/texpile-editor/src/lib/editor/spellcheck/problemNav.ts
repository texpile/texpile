// F8 and Shift-F8: to the next or previous spelling or grammar problem, wrapping around at either
// end. Both editors lint the whole document, so every problem is already in their decoration sets;
// each hands its ranges here and moves its own selection.

export type Span = { from: number; to: number };

/** the problem after (dir 1) or before (dir -1) the selection, or null when there are none */
export function nextProblem(spans: readonly Span[], selection: Span, dir: 1 | -1): Span | null {
	if (!spans.length) return null;
	const sorted = [...spans].sort((a, b) => a.from - b.from);
	// measured from the selection's start, so a problem the last jump selected is stepped past
	const hit = dir > 0 ? sorted.find((s) => s.from > selection.from) : sorted.findLast((s) => s.from < selection.from);
	return hit ?? (dir > 0 ? sorted[0] : sorted[sorted.length - 1]);
}
