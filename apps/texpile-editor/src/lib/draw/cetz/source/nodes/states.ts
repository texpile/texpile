import type { NodeBox, NodeBoxChange } from '$lib/draw/editor/figure/figureLanguage';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { namedArg, type CetzStatement } from '../picture';
import { setNamedArg } from '../styles/styles';

export const FINITE_IMPORT = '#import "@preview/finite:0.5.1"';

// finite's own, at the size TikZ's automata draws a state
const RADIUS = 0.6;

/** the document with finite imported, after the import of CeTZ */
export function withFinite(source: string) {
	if (/^#import\s+"@preview\/finite:/m.test(source)) return source;
	const line = /^#import\s+"@preview\/cetz:[^\n]*\n/m.exec(source);
	const at = line ? line.index + line[0].length : 0;
	return `${source.slice(0, at)}${FINITE_IMPORT}\n${source.slice(at)}`;
}

function flag(source: string, st: CetzStatement, name: string) {
	return namedArg(source, st, name)?.text === 'true';
}

export function readState(source: string, st: CetzStatement): NodeBox {
	const r = Number(namedArg(source, st, 'radius')?.text ?? RADIUS) || RADIUS;
	return { shape: 'circle', w: 2 * r, h: 2 * r, state: { initial: flag(source, st, 'initial'), accepting: flag(source, st, 'final') } };
}

/** a state marked where the machine starts or may stop, or sized; it stays a circle */
export function writeState(source: string, st: CetzStatement, change: NodeBoxChange, reread: (text: string) => CetzStatement | null) {
	let text = source;
	let now: CetzStatement | null = st;
	function set(name: string, value: string | null) {
		if (!now) return;
		text = setNamedArg(text, now, name, value);
		now = reread(text);
	}
	if (change.initial !== undefined) set('initial', change.initial ? 'true' : null);
	if (change.accepting !== undefined) set('final', change.accepting ? 'true' : null);
	const size = change.w ?? change.h;
	if (size) set('radius', size / 2 === RADIUS ? null : formatNumber(size / 2));
	return text;
}
