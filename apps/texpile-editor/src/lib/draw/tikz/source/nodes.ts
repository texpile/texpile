import type { Statement } from './picture';
import type { NodeBox, NodeBoxChange, NodeShape } from '$lib/draw/editor/figure/figureLanguage';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { withLibrary } from './options/libraries';
import { nodeOptionLists, readCommandOptions, writeCommandOptions } from './options/optionList';
import { CM_PER_UNIT } from '$lib/draw/editor/figure/lengthUnits';
import { texText, typedText } from './sourceText';

// each opener with what closes it, counted outside escapes: \{ and \$ are text
const PAIRS: [open: RegExp, close: RegExp, problem: string][] = [
	[/(?<!\\)\{/g, /(?<!\\)\}/g, 'Each { needs a } to close it'],
	[/\\\(/g, /\\\)/g, 'Close the math: \\( needs a \\)'],
	[/\\\[/g, /\\\]/g, 'Close the math: \\[ needs a \\]']
];
// each outline's options, the first naming it, and the library that draws it
const SHAPE_ITEMS: Record<NodeShape, { items: string[]; library?: string }> = {
	rectangle: { items: [] },
	rounded: { items: ['rounded corners'] },
	terminal: { items: ['rounded rectangle'], library: 'shapes.misc' },
	circle: { items: ['circle'] },
	ellipse: { items: ['ellipse'], library: 'shapes.geometric' },
	diamond: { items: ['diamond', 'aspect=2'], library: 'shapes.geometric' },
	slant: { items: ['trapezium', 'trapezium left angle=70', 'trapezium right angle=110'], library: 'shapes.geometric' },
	cylinder: { items: ['cylinder', 'shape border rotate=90', 'aspect=0.25'], library: 'shapes.geometric' }
};
/** the options that draw a node in this outline, and the library they need */
export function nodeShapeOptions(shape: NodeShape) {
	return SHAPE_ITEMS[shape];
}
const SHAPE_KEYS =
	/^(rounded corners|rounded rectangle|circle|ellipse|diamond|trapezium|cylinder|aspect|trapezium (left|right) angle|shape border rotate)\b/;

function nodeParts(st: Statement) {
	return st.command === '\\node' ? st.parts : [];
}

/** inside the braces of a `\node`'s own text */
export function nodeTextSpan(st: Statement) {
	const text = nodeParts(st).find((p) => p.type === 'text');
	return text ? { from: text.from + 1, to: text.to - 1 } : null;
}

/** a node's text as the lines `\\` breaks it into */
export function readNodeLines(source: string, st: Statement) {
	const span = nodeTextSpan(st);
	return span
		? source
				.slice(span.from, span.to)
				.split(/\s*\\\\\s*/)
				.map(typedText)
		: null;
}

/** the node's text set to these lines; TikZ breaks a node's text only when told how to align its lines */
export function writeNodeLines(source: string, st: Statement, lines: string[]) {
	const span = nodeTextSpan(st);
	if (!span) return null;
	const written = source.slice(0, span.from) + lines.map((l) => texText(l)).join(' \\\\ ') + source.slice(span.to);
	const aligned = nodeOptionLists(source, st).some((o) => o.items.some((i) => /^(align|text width)\s*=/.test(i)));
	const options = readCommandOptions(source, st);
	if (lines.length < 2 || aligned || !options) return written;
	return writeCommandOptions(written, options, [...options.items, 'align=center']);
}

/** text that would take the rest of the picture with it: an unclosed brace or math */
export function textProblem(text: string) {
	for (const [open, close, problem] of PAIRS) if ((text.match(open)?.length ?? 0) !== (text.match(close)?.length ?? 0)) return problem;
	if ((text.replace(/\\\$/g, '').match(/\$/g)?.length ?? 0) % 2) return 'Close the math: $ needs a second $';
	return null;
}

/** `\node (a) ...` or `\node[name=a]`, whichever names it */
export function nodeName(source: string, st: Statement) {
	for (const p of nodeParts(st)) {
		if (p.type === 'keyword' || p.type === 'text') break;
		const m = p.type === 'point' && source.slice(p.from, p.to).match(/^\(\s*([A-Za-z][\w-]*)\s*\)$/);
		if (m) return m[1];
	}
	const named = readCommandOptions(source, st)?.items.find((item) => /^name\s*=/.test(item));
	return named ? named.replace(/^name\s*=\s*/, '') : null;
}

/** a node something can point at: its own name, or `(n1)`, `(n2)` ... added after its options */
export function ensureNodeName(source: string, st: Statement) {
	const existing = nodeName(source, st);
	if (existing) return { source, name: existing };
	let k = 1;
	while (new RegExp(`\\(\\s*n${k}\\s*\\)|name\\s*=\\s*n${k}\\b`).test(source)) k++;
	const name = `n${k}`;
	const options = readCommandOptions(source, st);
	const at = options?.span?.to ?? options?.insertAt ?? st.from + '\\node'.length;
	return { source: `${source.slice(0, at)} (${name})${source.slice(at)}`, name };
}

/** a length option's value in cm; a bare number is in pt, as TikZ reads it */
export function lengthOf(items: string[], key: string) {
	const item = items.find((i) => new RegExp(`^${key}\\s*=`).test(i));
	const m = item && /=\s*(-?\d*\.?\d+)\s*(cm|mm|pt|in|bp)?\s*$/.exec(item);
	return m ? Number(m[1]) * CM_PER_UNIT[m[2] ?? 'pt'] : null;
}

export function readNodeBox(source: string, st: Statement): NodeBox | null {
	if (st.kind !== 'node') return null;
	const items = readCommandOptions(source, st)?.items ?? [];
	const shape = (Object.keys(SHAPE_ITEMS) as NodeShape[]).find((s) => {
		const item = SHAPE_ITEMS[s].items[0];
		return item && items.some((i) => i === item || i.startsWith(`${item}=`));
	});
	const size = lengthOf(items, 'minimum size');
	const state = items.includes('state')
		? { initial: items.some((i) => /^initial( (above|below|left|right|where\b.*))?$/.test(i)), accepting: items.includes('accepting') }
		: null;
	return { shape: shape ?? 'rectangle', w: lengthOf(items, 'minimum width') ?? size, h: lengthOf(items, 'minimum height') ?? size, state };
}

/** a state marked or unmarked as where the machine starts or may stop; the automata library draws both */
function withStateMarks(items: string[], change: NodeBoxChange) {
	let out = items;
	if (change.initial !== undefined) {
		out = out.filter((i) => !/^initial( (above|below|left|right|where\b.*))?$/.test(i));
		if (change.initial) out = [...out, 'initial'];
	}
	if (change.accepting !== undefined) {
		out = out.filter((i) => i !== 'accepting');
		if (change.accepting) out = [...out, 'accepting'];
	}
	return out;
}

export function writeNodeBox(source: string, st: Statement, change: NodeBoxChange) {
	const options = st.kind === 'node' ? readCommandOptions(source, st) : null;
	const now = readNodeBox(source, st);
	if (!options || !now) return null;
	if (change.initial !== undefined || change.accepting !== undefined)
		return writeCommandOptions(source, options, withStateMarks(options.items, change));
	const next = { ...now, ...change };
	// another outline's own options go with it; the same outline keeps the ones written for it
	const reshaped = next.shape !== now.shape;
	let items = options.items.filter(
		(i) => !(reshaped && SHAPE_KEYS.test(i)) && !/^minimum (width|height|size)\s*=/.test(i) && i !== 'rectangle'
	);
	if (change.shape && !items.some((i) => /^(draw|fill)\b/.test(i))) items = ['draw', ...items];
	const shape = SHAPE_ITEMS[next.shape];
	if (reshaped) items.push(...shape.items);
	if (next.w !== null) items.push(`minimum width=${formatNumber(next.w)}cm`);
	if (next.h !== null) items.push(`minimum height=${formatNumber(next.h)}cm`);
	const written = writeCommandOptions(source, options, items);
	return shape.library ? withLibrary(written, shape.library).source : written;
}
