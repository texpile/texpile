import type { CircuitPin } from '$lib/draw/editor/figure/figureLanguage';
import { nodeName } from '../nodes';
import type { Picture, Statement } from '../picture';
import { readCircuit } from './circuitOptions';
import { circuitPart } from './circuitParts';

// a pin's mark, numbered below zero so no statement takes it: where TeX put the named node's anchor
export const PIN_MARK = String.raw`\makeatletter\providecommand\tikzcappin[3]{\pgfutil@ifundefined{pgf@sh@ns@#1}{}{{%
\pgftransformshift{\pgfpointanchor{#1}{#2}}\pgfkeys{/tikz/tikzcap transform={#3}}}}}\makeatother`;
const PINS_PER_NODE = 8;

/** each named circuit node with its name and pins */
function pinnedNodes(source: string, statements: Statement[]) {
	return statements.flatMap((st) => {
		const pins = st.kind === 'node' ? (circuitPart(readCircuit(source, st)[0]?.type ?? '')?.pins ?? []) : [];
		const name = pins.length ? nodeName(source, st) : null;
		return name ? [{ i: st.i, name, pins }] : [];
	});
}

/** the marks that report every named circuit node's pins, at the end of the picture */
export function pinCuts(source: string, picture: Picture, kept: Statement[]) {
	const marks = pinnedNodes(source, kept).flatMap((n) =>
		n.pins.map((pin, k) => `\\tikzcappin{${n.name}}{${pin}}{${-(n.i * PINS_PER_NODE + k)}}`)
	);
	return marks.length ? [{ at: picture.endFrom, text: marks.join('') }] : [];
}

/** the pins TeX reported, by the node statement each belongs to */
export function readPins(source: string, picture: Picture, marks: { i: number; at: [number, number] }[]): CircuitPin[] {
	const nodes = pinnedNodes(source, picture.statements);
	return marks.flatMap((m) => {
		const i = Math.floor(-m.i / PINS_PER_NODE);
		const anchor = nodes.find((n) => n.i === i)?.pins[-m.i % PINS_PER_NODE];
		return anchor ? [{ i, anchor, at: m.at }] : [];
	});
}
