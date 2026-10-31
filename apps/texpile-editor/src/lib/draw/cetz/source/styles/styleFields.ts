import type { StyleFieldSet } from '$lib/draw/editor/figure/figureLanguage';
import { NO_STYLE_FIELDS, styleFieldsOf } from '$lib/draw/editor/figure/styleFields';
import type { CetzStatement } from '../picture';
import { contentTextSpan } from '../nodes/nodeText';
import { readStyle } from './styles';

const OPEN = new Set(['line', 'bezier', 'bezier-through', 'catmull', 'hobby', 'arc']);
// drawn along points it measures or marks, with ends of its own: a line's color and pattern, nothing to fill
const MARKINGS = new Set(['texpile-dimension', 'brace', 'flat-brace', 'angle', 'right-angle', 'grid', 'coil', 'zigzag', 'wave']);
// CeTZ draws these filled, so a line's width says nothing
const FILLED = new Set(['brace', 'flat-brace']);

/** the style fields a statement draws with */
export function styleFields(source: string, st: CetzStatement): StyleFieldSet {
	if (st.kind !== 'node' && st.kind !== 'path') return NO_STYLE_FIELDS;
	const closed = st.command === 'line' && /\bclose:\s*true\b/.test(source.slice(st.from, st.to));
	const base = st.kind === 'node' ? styleFieldsOf('node', false) : styleFieldsOf('path', OPEN.has(st.command) && !closed);
	const marking = MARKINGS.has(st.command);
	const lined = readStyle(source, st)?.stroke !== null;
	const span = st.kind === 'node' ? contentTextSpan(source, st) : null;
	return {
		...base,
		fill: base.fill && !marking,
		arrows: base.arrows && !marking,
		width: base.width && lined && !FILLED.has(st.command),
		dash: base.dash && lined,
		text: base.text && !!(span && source.slice(span.from, span.to).trim()),
		corners: st.kind === 'path' && st.command === 'rect'
	};
}
