import type { FigureStatement } from '$lib/draw/editor/figure/figureLanguage';
import { readDiagram } from './cd/cdPicture';
import { readTreePicture } from './forest/forestPicture';
import { isCircuit } from './circuits/circuitOptions';
import { axisRegions, axisStatements } from './plots/axisStatements';
import { definitionBodies } from './reader/definitionBodies';
import { readBody } from './reader/readStatements';
import type { ReadStatement, SyntaxPart } from './reader/syntaxParts';
import { groupEnd, skipBlank } from './reader/texScan';

export type Statement = FigureStatement & {
	/** `\draw`, `\node`, ... or '' */
	command: string;
	inScope: boolean;
	parts: SyntaxPart[];
	body: ReadStatement[];
};

export type Picture = {
	from: number;
	to: number;
	/** a TikZ picture, a tikz-cd diagram, whose cells and arrows are its statements, or a forest tree of branches */
	env: 'tikzpicture' | 'tikzcd' | 'forest';
	layout?: 'grid' | 'tree';
	circuit?: boolean;
	/** where the body starts: after `\begin{tikzpicture}` and its options */
	bodyFrom: number;
	/** where `\end{tikzpicture}` starts */
	endFrom: number;
	statements: Statement[];
};

// circuitikz's environment is a tikzpicture with circuit settings
const PICTURE_NAMES: Record<string, Picture['env']> = {
	tikzpicture: 'tikzpicture',
	circuitikz: 'tikzpicture',
	tikzcd: 'tikzcd',
	forest: 'forest'
};

/** the top-level pictures that close, and where one that never closes opens */
function scanPictures(source: string) {
	const found: { from: number; to: number; env: Picture['env']; name: string }[] = [];
	let depth = 0;
	let start = 0;
	let name = 'tikzpicture';
	// an escaped symbol (\%, \\) is skipped whole, so only a real % starts a comment; code shown verbatim is skipped too
	const tokens =
		/\\(begin|end)\{(tikzpicture|circuitikz|tikzcd|forest)\}|\\begin\{(verbatim\*?|Verbatim|lstlisting|minted|comment)\}[\s\S]*?\\end\{\3\}|\\verb\*?([^a-zA-Z*\s])[^\n]*?\4|\\[^a-zA-Z]|%[^\n]*/g;
	for (const m of source.matchAll(tokens)) {
		if (!m[1]) continue;
		if (m[1] === 'begin' && depth++ === 0) {
			start = m.index!;
			name = m[2];
		} else if (m[1] === 'end' && depth > 0 && --depth === 0)
			found.push({ from: start, to: m.index! + m[0].length, env: PICTURE_NAMES[name], name });
	}
	// a picture in a macro's or an environment's definition is a template rather than a figure
	const bodies = definitionBodies(source);
	function inBody(at: number) {
		return bodies.some(([from, to]) => from < at && at < to);
	}
	return { found: found.filter((p) => !inBody(p.from)), open: depth > 0 && !inBody(start) ? { at: start, name } : null };
}

/** where each top-level tikzpicture, tikzcd or forest sits; a whole document can hold many, and a node can hold a picture of its own */
export function listPictures(source: string) {
	return scanPictures(source).found;
}

/** a picture begun and never ended: how it opens and what would close it, and the line it begins on */
export function unclosedPicture(source: string) {
	const open = scanPictures(source).open;
	return open && { open: `\\begin{${open.name}}`, close: `\\end{${open.name}}`, line: source.slice(0, open.at).split('\n').length };
}

/** the source's `index`th tikzpicture, or null when there is none */
export function readPicture(source: string, index = 0): Picture | null {
	const extent = listPictures(source)[index];
	if (!extent) return null;
	if (extent.env === 'tikzcd') return readDiagram(source, extent.from, extent.to);
	if (extent.env === 'forest') return readTreePicture(source, extent.from, extent.to);
	const endFrom = extent.to - `\\end{${extent.name}}`.length;
	const beginTo = extent.from + `\\begin{${extent.name}}`.length;
	const open = skipBlank(source, beginTo, endFrom);
	const bodyFrom = source[open] === '[' ? groupEnd(source, open, endFrom) : beginTo;
	// pgfplots' axes are read apart, and blanked for the reader
	const axes = axisRegions(source, extent.from, extent.to);
	let read = source;
	for (const a of axes) read = read.slice(0, a.from) + read.slice(a.from, a.to).replace(/[^\n]/g, ' ') + read.slice(a.to);
	const statements: Statement[] = [];
	function visit(body: ReadStatement[], inScope: boolean) {
		for (const st of body) {
			statements.push({ ...st, i: statements.length + 1, inScope });
			if (st.kind === 'scope') visit(st.body, true);
		}
	}
	visit(readBody(read, bodyFrom, endFrom).statements, false);
	const circuit = extent.name === 'circuitikz' || isCircuit(source, statements);
	if (!axes.length) return { from: extent.from, to: extent.to, env: 'tikzpicture', circuit, bodyFrom, endFrom, statements };
	// numbered again in written order, as the engine's marks count them
	const all = [...statements, ...axes.flatMap((a) => axisStatements(source, a))]
		.sort((a, b) => a.from - b.from || b.to - a.to)
		.map((s, k) => ({ ...s, i: k + 1 }));
	for (const s of all) if (s.kind === 'axis') s.inScope = all.some((o) => o.kind === 'scope' && o.from < s.from && s.to <= o.to);
	return { from: extent.from, to: extent.to, env: 'tikzpicture', circuit, bodyFrom, endFrom, statements: all };
}

/** a statement as read, numbered 0 */
export function unnumbered(st: ReadStatement, inScope: boolean): Statement {
	return { ...st, i: 0, inScope };
}

/** the statements inside a scope, at any depth, numbered 0 */
export function nestedStatements(st: Statement) {
	const out: Statement[] = [];
	function visit(body: ReadStatement[]) {
		for (const s of body) {
			out.push(unnumbered(s, true));
			if (s.kind === 'scope') visit(s.body);
		}
	}
	if (st.kind === 'scope') visit(st.body);
	return out;
}

export function statementAt(picture: Picture, pos: number) {
	let found: Statement | null = null;
	for (const st of picture.statements) if (st.from <= pos && pos <= st.to && st.kind !== 'scope') found = st;
	return found;
}
