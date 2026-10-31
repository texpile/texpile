import type { PointSpan } from '$lib/draw/editor/figure/figureLanguage';
import { writtenPoints } from '../coordinates';
import type { CetzStatement } from '../picture';
import { readOutline } from './nodeOutline';

/** the points the canvas takes the statement by: a node's is its middle, as a TikZ node's is where it is written, and
 *  stands for its outline's own points, which move with it */
export function pathPoints(source: string, st: CetzStatement): PointSpan[] {
	const outline = st.kind === 'node' && st.text && writtenPoints(source, st).length ? readOutline(source, st) : null;
	if (!outline) return writtenPoints(source, st);
	const [x, y] = outline.center;
	return [{ from: st.inner.from, to: st.close + 1, x, y }];
}
