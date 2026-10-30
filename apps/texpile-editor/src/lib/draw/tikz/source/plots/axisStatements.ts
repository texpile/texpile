import type { PointSpan } from '$lib/draw/editor/figure/figureLanguage';
import { plainStatement, type Unnumbered } from '../plainStatement';
import type { Statement } from '../picture';

// pgfplots' own environments, read apart from TikZ's
const AXIS = /\\begin\{(axis|semilogxaxis|semilogyaxis|loglogaxis)\}/g;
const NUM = String.raw`(-?\d*\.?\d+(?:[eE][-+]?\d+)?)`;
const POINT = new RegExp(String.raw`\(\s*${NUM}\s*(cm)?\s*,\s*${NUM}\s*(cm)?\s*\)`, 'g');

/** where a group opened at `at` closes, braces and brackets counted */
function closing(text: string, at: number, open: string, close: string) {
	let depth = 0;
	for (let k = at; k < text.length; k++) {
		if (text[k] === '\\') k++;
		else if (text[k] === open) depth++;
		else if (text[k] === close && --depth === 0) return k + 1;
	}
	return -1;
}

/** each axis environment in the picture, outermost */
export function axisRegions(source: string, from: number, to: number) {
	const out: { from: number; to: number; env: string }[] = [];
	const text = source.slice(0, to);
	AXIS.lastIndex = from;
	for (let m = AXIS.exec(text); m; m = AXIS.exec(text)) {
		const end = text.indexOf(`\\end{${m[1]}}`, m.index);
		if (end < 0) break;
		const until = end + `\\end{${m[1]}}`.length;
		out.push({ from: m.index, to: until, env: m[1] });
		AXIS.lastIndex = until;
	}
	return out;
}

/** the axis and each `\addplot ... ;` in it, as statements */
export function axisStatements(source: string, region: { from: number; to: number; env: string }): Unnumbered[] {
	const out = [plainStatement(region.from, region.to, 'axis', `\\begin{${region.env}}`, false)];
	const body = source.slice(0, region.to);
	const PLOT = /\\addplot\b\+?/g;
	PLOT.lastIndex = region.from;
	for (let m = PLOT.exec(body); m; m = PLOT.exec(body)) {
		// the plot ends at its semicolon, outside its options and its braces
		let k = m.index + m[0].length;
		for (; k < region.to && body[k] !== ';'; k++) {
			if (body[k] === '{') k = closing(body, k, '{', '}') - 1;
			else if (body[k] === '[') k = closing(body, k, '[', ']') - 1;
			if (k < 0) return out;
		}
		out.push(plainStatement(m.index, k + 1, 'plot', '\\addplot', true));
		PLOT.lastIndex = k + 1;
	}
	return out;
}

/** the options right after `\begin{axis}` or `\addplot` (and its `+`), brackets included; or where they would go */
export function plotOptionSpan(source: string, st: Statement) {
	let at = st.from + (st.kind === 'axis' ? st.command.length : '\\addplot'.length);
	if (source[at] === '+') at++;
	const ws = /^\s*/.exec(source.slice(at))![0].length;
	if (source[at + ws] !== '[') return { from: at, to: at, empty: true };
	return { from: at + ws, to: closing(source, at + ws, '[', ']'), empty: false };
}

/** a plot's data points, and an axis's own place (`at=`), as points the canvas moves */
export function plotPoints(source: string, st: Statement): PointSpan[] {
	function spans(from: number, to: number) {
		return [...source.slice(from, to).matchAll(POINT)].map((m) => ({
			from: from + m.index!,
			to: from + m.index! + m[0].length,
			x: Number(m[1]),
			y: Number(m[3]),
			cm: !!m[2]
		}));
	}
	if (st.kind === 'axis') {
		const o = plotOptionSpan(source, st);
		const at = /\bat\s*=\s*\{?\s*(?=\()/.exec(source.slice(o.from, o.to));
		// a bare number in `at=` is in the axis' own units, so only a place in cm is the canvas'
		const place = at ? spans(o.from + at.index + at[0].length, o.to).slice(0, 1) : [];
		return place.filter((p) => p.cm);
	}
	const coordinatesAt = /\bcoordinates\s*\{/.exec(source.slice(st.from, st.to));
	if (!coordinatesAt) return [];
	const open = st.from + coordinatesAt.index + coordinatesAt[0].length - 1;
	return spans(open, closing(source, open, '{', '}'));
}
