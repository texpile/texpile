import type { PointSpan } from '$lib/draw/editor/figure/figureLanguage';
import { writtenPoints } from '../coordinates';
import type { CetzStatement } from '../picture';
import { readOutline } from './nodeOutline';

export function pathPoints(source: string, st: CetzStatement): PointSpan[] {
	const outline = st.kind === 'node' && st.text && writtenPoints(source, st).length ? readOutline(source, st) : null;
	if (!outline) return writtenPoints(source, st);
	const [x, y] = outline.center;
	return [{ from: st.inner.from, to: st.close + 1, x, y }];
}
