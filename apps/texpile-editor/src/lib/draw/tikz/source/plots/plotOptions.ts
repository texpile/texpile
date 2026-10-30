import type { PlotAxis, PlotSeries } from '$lib/draw/editor/figure/figureLanguage';
import { formatNumber, formatPoint } from '$lib/draw/editor/figure/numbers';
import { lengthOf } from '../nodes';
import { splitItems } from '../options/optionList';
import type { Statement } from '../picture';
import { isColor } from '../options/styleOptions';
import { indentAt, lineStart, texText, typedText } from '../sourceText';
import { plotOptionSpan } from './axisStatements';

const MARKS = ['none', '*', 'o', 'square*'] as const;
const FUNCTION_PLOT = '\\addplot[red, thick, domain=-2:2, samples=50] {x^3/4};';
const POINTS_PLOT = `\\addplot[blue, mark=*] coordinates {${[
	[-1, 0.5],
	[0, 1],
	[1, 2]
]
	.map((p) => formatPoint(p as [number, number]))
	.join(' ')}};`;

function keyOf(item: string) {
	return item.split('=')[0].trim();
}
function valueOf(items: string[], key: string) {
	const item = items.find((i) => keyOf(i) === key && i.includes('='));
	return item ? item.slice(item.indexOf('=') + 1).trim() : null;
}
// `{$x$}` shows as `$x$`
function unbraced(v: string | null) {
	return v && typedText(/^\{.*\}$/s.test(v) ? v.slice(1, -1) : v);
}
function numberOr(v: string | null) {
	return v !== null && Number.isFinite(Number(v)) ? Number(v) : null;
}

function optionsOf(source: string, st: Statement) {
	const span = plotOptionSpan(source, st);
	return { span, items: span.empty ? [] : splitItems(source.slice(span.from + 1, span.to - 1)) };
}

function writeOptions(source: string, st: Statement, items: string[]) {
	const { span } = optionsOf(source, st);
	const text = items.length ? `[${items.join(', ')}]` : '';
	return source.slice(0, span.from) + text + source.slice(span.to);
}

/** the items with `key` set to `value`, or taken out when it is null */
function withKey(items: string[], key: string, value: string | null) {
	const rest = items.filter((i) => keyOf(i) !== key);
	return value === null ? rest : [...rest, `${key}=${value}`];
}

export function readAxis(source: string, st: Statement): PlotAxis | null {
	if (st.kind !== 'axis') return null;
	const { items } = optionsOf(source, st);
	const grid = valueOf(items, 'grid');
	const lines = valueOf(items, 'axis lines');
	return {
		title: unbraced(valueOf(items, 'title')),
		xlabel: unbraced(valueOf(items, 'xlabel')),
		ylabel: unbraced(valueOf(items, 'ylabel')),
		x: [numberOr(valueOf(items, 'xmin')), numberOr(valueOf(items, 'xmax'))],
		y: [numberOr(valueOf(items, 'ymin')), numberOr(valueOf(items, 'ymax'))],
		width: lengthOf(items, 'width'),
		height: lengthOf(items, 'height'),
		grid: grid === 'major' || grid === 'both' ? grid : items.includes('grid') ? 'major' : 'none',
		lines: lines === 'left' || lines === 'middle' ? lines : lines === 'center' ? 'middle' : 'box'
	};
}

export function writeAxis(source: string, st: Statement, change: Partial<PlotAxis>) {
	if (st.kind !== 'axis') return null;
	let items = optionsOf(source, st).items;
	function text(v: string | null | undefined) {
		return v ? `{${texText(v)}}` : null;
	}
	function num(v: number | null) {
		return v === null ? null : formatNumber(v);
	}
	function cm(v: number | null) {
		return v === null ? null : `${formatNumber(v)}cm`;
	}
	for (const key of ['title', 'xlabel', 'ylabel'] as const) if (key in change) items = withKey(items, key, text(change[key]));
	if (change.x) items = withKey(withKey(items, 'xmin', num(change.x[0])), 'xmax', num(change.x[1]));
	if (change.y) items = withKey(withKey(items, 'ymin', num(change.y[0])), 'ymax', num(change.y[1]));
	if (change.width !== undefined) items = withKey(items, 'width', cm(change.width));
	if (change.height !== undefined) items = withKey(items, 'height', cm(change.height));
	if (change.grid)
		items = withKey(
			items.filter((i) => i !== 'grid'),
			'grid',
			change.grid === 'none' ? null : change.grid
		);
	if (change.lines) items = withKey(items, 'axis lines', change.lines === 'box' ? null : change.lines);
	return writeOptions(source, st, items);
}

/** a function plot's expression: the braces after the options, `\addplot {x^2};` */
function expressionSpan(source: string, st: Statement) {
	const { span } = optionsOf(source, st);
	const rest = source.slice(span.to, st.to);
	const m = /^\s*\{/.exec(rest);
	if (!m) return null;
	const from = span.to + m[0].length;
	let depth = 1;
	for (let k = from; k < st.to; k++) {
		if (source[k] === '{') depth++;
		else if (source[k] === '}' && --depth === 0) return { from, to: k };
	}
	return null;
}

export function readPlot(source: string, st: Statement): PlotSeries | null {
	if (st.kind !== 'plot') return null;
	const { items } = optionsOf(source, st);
	const expr = expressionSpan(source, st);
	const domain = valueOf(items, 'domain')?.split(':') ?? [];
	const mark = valueOf(items, 'mark');
	return {
		expression: expr ? source.slice(expr.from, expr.to) : null,
		domain: [numberOr(domain[0] ?? null), numberOr(domain[1] ?? null)],
		color: items.find(isColor) ?? null,
		mark: items.includes('no marks') ? 'none' : (MARKS.find((m) => m === mark) ?? 'none'),
		line: items.includes('only marks') ? 'only marks' : items.includes('dashed') ? 'dashed' : 'solid'
	};
}

export function writePlot(source: string, st: Statement, change: Partial<PlotSeries>) {
	if (st.kind !== 'plot') return null;
	let out = source;
	// the expression first, after the options, so the options' span still holds
	const expr = expressionSpan(source, st);
	if (change.expression && expr) out = out.slice(0, expr.from) + change.expression + out.slice(expr.to);
	let items = optionsOf(source, st).items;
	if (change.domain) {
		const [a, b] = change.domain;
		items = withKey(items, 'domain', a === null || b === null ? null : `${formatNumber(a)}:${formatNumber(b)}`);
	}
	if ('color' in change) items = [...items.filter((i) => !isColor(i)), ...(change.color ? [change.color] : [])];
	if (change.mark)
		items = withKey(
			items.filter((i) => i !== 'no marks'),
			'mark',
			change.mark
		);
	if (change.line) {
		items = items.filter((i) => i !== 'only marks' && i !== 'dashed' && i !== 'solid');
		if (change.line !== 'solid') items.push(change.line);
	}
	return writeOptions(out, st, items);
}

/** a new plot as the last thing in the axis, indented as its others are */
export function addPlot(source: string, axis: Statement, kind: 'function' | 'points') {
	if (axis.kind !== 'axis') return null;
	const end = source.lastIndexOf('\\end{', axis.to);
	const line = lineStart(source, end);
	const indent = indentAt(source, end);
	const plot = kind === 'function' ? FUNCTION_PLOT : POINTS_PLOT;
	if (source.slice(line, end).trim() !== '') return `${source.slice(0, end)}${plot} ${source.slice(end)}`;
	return `${source.slice(0, line)}${indent}  ${plot}\n${source.slice(line)}`;
}

/** a new axis with a function in it, its lower left corner at `at` */
export function axisFor(at: readonly [number, number]) {
	return [
		`\\begin{axis}[width=8cm, height=6cm, xlabel={$x$}, ylabel={$y$}, at={(${formatNumber(at[0])}cm,${formatNumber(at[1])}cm)}]`,
		'  \\addplot[blue, thick, domain=-2:2, samples=50] {x^2};',
		'\\end{axis}'
	].join('\n');
}
