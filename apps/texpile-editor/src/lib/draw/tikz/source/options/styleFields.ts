import type { StyleFieldSet } from '$lib/draw/editor/figure/figureLanguage';
import { NO_STYLE_FIELDS, styleFieldsOf } from '$lib/draw/editor/figure/styleFields';
import { readCircuit } from '../circuits/circuitOptions';
import { nodeTextSpan } from '../nodes';
import type { Statement } from '../picture';
import { readCommandOptions } from './optionList';
import { readStyle, targetOf } from './styleOptions';

/** the style fields a statement draws with */
export function styleFields(source: string, st: Statement): StyleFieldSet {
	const target = st.kind === 'path' || st.kind === 'node' ? targetOf(st.command) : null;
	const options = target ? readCommandOptions(source, st) : null;
	if (!target || !options) return NO_STYLE_FIELDS;
	const text = source.slice(st.from, st.to);
	const base = styleFieldsOf(target, st.kind === 'path' && !/\b(rectangle|circle|ellipse|cycle|grid)\b/.test(text));
	const lined = readStyle(options.items, target).stroke !== null;
	const span = st.kind === 'node' ? nodeTextSpan(st) : null;
	// circuitikz draws a part as it is, in its line's color
	const part = readCircuit(source, st).length > 0;
	return {
		...base,
		fill: base.fill && !(part && st.kind === 'node'),
		width: base.width && lined,
		dash: base.dash && lined,
		text: base.text && !part && !!(span && source.slice(span.from, span.to).trim()),
		corners: base.corners && !/\b(circle|ellipse|grid)\b/.test(text)
	};
}
