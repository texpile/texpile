import { ROW_CLUSTER } from '../heuristics/tolerances';

// The y range holding a band's rows INCLUDING the parts of them that sit off the baseline. A
// superscript, an accent or inline maths records its OWN baseline, above the line's, so a
// window clipped at the first line's baseline drops it: the row then reproduces short and the
// band is refused as different text. Half a line gap is exactly the reach glyphRows clusters
// over, which is why nothing from the neighbouring baseline can arrive with it.
export function bandWindow(first: number, last: number, gap: number): { top: number; bottom: number } {
	const pad = Math.max(0.5, gap * ROW_CLUSTER);
	return { top: first - pad, bottom: last + pad };
}
