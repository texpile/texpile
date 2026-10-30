import type { PartType, SyntaxPart } from './syntaxParts';
import { commandAt, groupEnd, skipBlank, wordAt } from './texScan';

const KEYWORDS = new Set([
	'at',
	'bend',
	'cycle',
	'circle',
	'controls',
	'and',
	'rectangle',
	'ellipse',
	'arc',
	'grid',
	'plot',
	'coordinates',
	'parabola',
	'sin',
	'cos'
]);
// where a statement without its `;` ends: the next one starts
const STATEMENT_START =
	/^\\(?:draw|graph|path|filldraw|fill|pattern|clip|shade|shadedraw|useasboundingbox|matrix|coordinate|node|pic|end\b|begin\{scope\})(?![A-Za-z@])/;

/** braces in a `\node` statement hold its text; on a path, a group of parts */
export type BraceReading = 'group' | 'text';

function part(type: PartType, from: number, to: number, parts: SyntaxPart[] = []): SyntaxPart {
	return { type, from, to, parts };
}

function last(parts: SyntaxPart[], from: number) {
	return parts.at(-1)?.to ?? from;
}

/** `+(...)` or `++(...)` */
function readRelative(source: string, at: number, to: number) {
	const prefixEnd = source.startsWith('++', at) ? at + 2 : at + 1;
	const open = skipBlank(source, prefixEnd, to);
	if (source[open] !== '(') return null;
	const point = part('point', open, groupEnd(source, open, to));
	return part('relative', at, point.to, [part('prefix', at, prefixEnd), point]);
}

/** a point, or a `+`/`++` one */
function readPlace(source: string, at: number, to: number) {
	if (source[at] === '(') return part('point', at, groupEnd(source, at, to));
	return source[at] === '+' ? readRelative(source, at, to) : null;
}

/** `[...]` if one is next */
function readOptions(source: string, at: number, to: number) {
	const i = skipBlank(source, at, to);
	return source[i] === '[' ? part('options', i, groupEnd(source, i, to)) : null;
}

function readGroup(source: string, at: number, to: number, type: 'group' | 'text') {
	const end = groupEnd(source, at, to);
	return part(type, at, end, type === 'group' ? readParts(source, at + 1, end - 1, 'group', false).parts : []);
}

/** a loop's head up to and with its list: `foreach \x [count=\i] in {1,2}` */
export function readLoopHead(source: string, at: number, to: number, keyword: number) {
	const parts: SyntaxPart[] = [part('keyword', at, keyword)];
	let i = skipBlank(source, keyword, to);
	while (i < to && wordAt(source, i) !== 'in' && source[i] !== '{' && source[i] !== ';') {
		const p = readOne(source, i, to, 'group');
		parts.push(p);
		i = skipBlank(source, p.to, to);
	}
	if (wordAt(source, i) !== 'in') return parts;
	parts.push(part('keyword', i, i + 2));
	const list = skipBlank(source, i + 2, to);
	if (list < to) parts.push(readOne(source, list, to, 'group'));
	return parts;
}

/** `node [options] (name) at (x,y) {text}`; its `at` places it and its name is no point */
function readNode(source: string, at: number, to: number) {
	const parts: SyntaxPart[] = [part('keyword', at, at + 4)];
	let i = skipBlank(source, at + 4, to);
	while (i < to) {
		let p: SyntaxPart | null = null;
		if (source[i] === '[') p = part('options', i, groupEnd(source, i, to));
		else if (source[i] === '(') p = part('nodeName', i, groupEnd(source, i, to), [part('point', i, groupEnd(source, i, to))]);
		else if (wordAt(source, i) === 'at') {
			const place = readPlace(source, skipBlank(source, i + 2, to), to);
			p = place && part('placement', i, place.to, [part('keyword', i, i + 2), place]);
		} else if (wordAt(source, i) === 'foreach') {
			const loop = readLoopHead(source, i, to, i + 7);
			p = part('loop', i, last(loop, i), loop);
		} else if (source[i] === '{') p = readGroup(source, i, to, 'text');
		if (!p) break;
		parts.push(p);
		if (p.type === 'text') break;
		i = skipBlank(source, p.to, to);
	}
	return part('node', at, last(parts, at), parts);
}

/** `to [options] node {...} (target)`; an edge the same, drawn apart from the path */
function readTo(source: string, at: number, to: number, type: 'to' | 'edge', keyword: number) {
	const parts: SyntaxPart[] = [part('keyword', at, keyword)];
	let i = skipBlank(source, keyword, to);
	const options = readOptions(source, i, to);
	if (options) {
		parts.push(options);
		i = skipBlank(source, options.to, to);
	}
	while (wordAt(source, i) === 'node' || wordAt(source, i) === 'pic') {
		const p = wordAt(source, i) === 'node' ? readNode(source, i, to) : readPic(source, i, to);
		parts.push(p);
		i = skipBlank(source, p.to, to);
	}
	const target = wordAt(source, i) === 'cycle' ? part('keyword', i, i + 5) : readPlace(source, i, to);
	if (target) parts.push(part('target', target.from, target.to, [target]));
	return part(type, at, last(parts, at), parts);
}

/** `pic [options] at (x,y) {name}` */
function readPic(source: string, at: number, to: number) {
	const parts: SyntaxPart[] = [part('keyword', at, at + 3)];
	let i = skipBlank(source, at + 3, to);
	for (;;) {
		let p: SyntaxPart | null = null;
		if (source[i] === '[') p = part('options', i, groupEnd(source, i, to));
		else if (source[i] === '(') p = part('nodeName', i, groupEnd(source, i, to), [part('point', i, groupEnd(source, i, to))]);
		else if (wordAt(source, i) === 'at') {
			const place = readPlace(source, skipBlank(source, i + 2, to), to);
			p = place && part('placement', i, place.to, [part('keyword', i, i + 2), place]);
		}
		if (!p) break;
		parts.push(p);
		i = skipBlank(source, p.to, to);
	}
	if (source[i] === '{') parts.push(readGroup(source, i, to, 'group'));
	return part('pic', at, last(parts, at), parts);
}

/** an operation whose parts run to a word: `let ... in` */
function readLet(source: string, at: number, to: number) {
	const parts: SyntaxPart[] = [part('keyword', at, at + 3)];
	let i = skipBlank(source, at + 3, to);
	while (i < to && source[i] !== ';' && wordAt(source, i) !== 'in') {
		const p = readOne(source, i, to, 'group');
		parts.push(p);
		i = skipBlank(source, p.to, to);
	}
	if (wordAt(source, i) === 'in') parts.push(part('keyword', i, i + 2));
	return part('let', at, last(parts, at), parts);
}

/** an operation of a keyword, options and a group: `child [...] {...}`, `decorate {...}`, `svg {...}` */
function readGrouped(source: string, at: number, to: number, type: PartType, keyword: number) {
	const parts: SyntaxPart[] = [part('keyword', at, keyword)];
	let i = skipBlank(source, keyword, to);
	const options = readOptions(source, i, to);
	if (options) {
		parts.push(options);
		i = skipBlank(source, options.to, to);
	}
	if (wordAt(source, i) === 'foreach') {
		const loop = readLoopHead(source, i, to, i + 7);
		parts.push(part('loop', i, last(loop, i), loop));
		i = skipBlank(source, last(loop, i), to);
	}
	if (source[i] === '{') parts.push(readGroup(source, i, to, 'group'));
	else if (source[i] === '"') parts.push(part('word', i, source.indexOf('"', i + 1) + 1 || to));
	return part(type, at, last(parts, at), parts);
}

/** `edge from parent [options] node {...}`, how a tree draws the edge to a child */
function readEdgeFromParent(source: string, at: number, to: number, keyword: number) {
	const parts: SyntaxPart[] = [part('keyword', at, keyword)];
	const options = readOptions(source, keyword, to);
	if (options) parts.push(options);
	const node = skipBlank(source, last(parts, at), to);
	if (wordAt(source, node) === 'node') parts.push(readNode(source, node, to));
	return part('operation', at, last(parts, at), parts);
}

function readWordPart(source: string, at: number, to: number, word: string): SyntaxPart {
	const end = at + word.length;
	if (word === 'node') return readNode(source, at, to);
	if (word === 'to') return readTo(source, at, to, 'to', end);
	if (word === 'edge') {
		const from = skipBlank(source, end, to);
		const parent = skipBlank(source, from + wordAt(source, from).length, to);
		const fromParent = ['from', 'to'].includes(wordAt(source, from)) && wordAt(source, parent) === 'parent';
		return fromParent ? readEdgeFromParent(source, at, to, parent + 6) : readTo(source, at, to, 'edge', end);
	}
	if (word === 'coordinate') {
		const parts = [part('keyword', at, end)];
		const options = readOptions(source, end, to);
		if (options) parts.push(options);
		const name = skipBlank(source, last(parts, at), to);
		if (source[name] === '(') parts.push(part('point', name, groupEnd(source, name, to)));
		return part('coordinate', at, last(parts, at), parts);
	}
	if (word === 'pic') return readPic(source, at, to);
	if (word === 'let') return readLet(source, at, to);
	if (word === 'child') return readGrouped(source, at, to, 'child', end);
	if (word === 'decorate' || word === 'svg') return readGrouped(source, at, to, 'operation', end);
	if (word === 'foreach') {
		const loop = readLoopHead(source, at, to, end);
		const body = skipBlank(source, last(loop, at), to);
		if (source[body] === '{') loop.push(readGroup(source, body, to, 'group'));
		return part('loop', at, last(loop, at), loop);
	}
	return part(KEYWORDS.has(word) ? 'keyword' : 'word', at, end);
}

function readOne(source: string, at: number, to: number, braces: BraceReading): SyntaxPart {
	const c = source[at];
	const two = source.slice(at, at + 2);
	if (c === '[') return part('options', at, groupEnd(source, at, to));
	if (c === '(') return part('point', at, groupEnd(source, at, to));
	if (c === '+') return readRelative(source, at, to) ?? part('word', at, at + 1);
	if (two === '--' || two === '-|' || two === '|-' || two === '..') return part('operator', at, at + 2);
	if (c === ',') return part('operator', at, at + 1);
	if (c === '{') return readGroup(source, at, to, braces);
	if (c === '\\') {
		const command = commandAt(source, at);
		if (command === '\\foreach') {
			const loop = readLoopHead(source, at, to, at + command.length);
			const body = skipBlank(source, last(loop, at), to);
			if (source[body] === '{') loop.push(readGroup(source, body, to, 'group'));
			return part('loop', at, last(loop, at), loop);
		}
		return part('word', at, at + command.length);
	}
	const word = wordAt(source, at);
	if (word) return readWordPart(source, at, to, word);
	const number = /^\d*\.?\d+/.exec(source.slice(at, at + 32))?.[0];
	return part('word', at, at + (number?.length || 1));
}

/** a statement starts at `at`, where one without its `;` ends */
export function startsStatement(source: string, at: number) {
	return STATEMENT_START.test(source.slice(at, at + 24));
}

/** the parts from `from` on, to the statement's `;` when `untilSemicolon`, else to `to`; `endsBefore` says where a
 *  statement without its `;` stops */
export function readParts(
	source: string,
	from: number,
	to: number,
	braces: BraceReading,
	untilSemicolon: boolean,
	endsBefore = startsStatement
) {
	const parts: SyntaxPart[] = [];
	let i = skipBlank(source, from, to);
	while (i < to) {
		if (untilSemicolon && source[i] === ';') return { parts, end: i + 1 };
		if (untilSemicolon && endsBefore(source, i)) return { parts, end: last(parts, from) };
		const p = readOne(source, i, to, braces);
		parts.push(p);
		i = skipBlank(source, p.to, to);
	}
	return { parts, end: last(parts, from) };
}
