import { diagramCuts, SLOT_MARK } from './cd/cdPicture';
import { PIN_MARK, pinCuts } from './circuits/circuitPins';
import type { CdGrid } from './cd/cdGrid.types';
import { TREE_MARK, treeCuts } from './forest/forestPicture';
import type { ForestTree } from './forest/forestTree';
import { readCommandOptions } from './options/optionList';
import { plotOptionSpan } from './plots/axisStatements';
import type { Picture } from './picture';

// set-up a document body may do between \begin{document} and the picture; these define, never typeset
const SETUP =
	/\\(tikzset|tikzstyle|pgfplotsset|pgfkeys|tdplotsetmaincoords|definecolor|colorlet|pgfmathsetmacro|pgfmathtruncatemacro|newcommand|renewcommand|providecommand|def|newlength|setlength|pgfdeclarelayer|pgfsetlayers|usetikzlibrary)(?![a-zA-Z])/g;

// each command's arguments, as LaTeX reads them: m a group or one token, o an optional [...], s an optional star
const ARGUMENTS: Record<string, string> = {
	tikzset: 'm',
	pgfplotsset: 'm',
	pgfkeys: 'm',
	tdplotsetmaincoords: 'mm',
	definecolor: 'ommm',
	colorlet: 'omom',
	pgfmathsetmacro: 'mm',
	pgfmathtruncatemacro: 'mm',
	newcommand: 'smoom',
	renewcommand: 'smoom',
	providecommand: 'smoom',
	newlength: 'm',
	setlength: 'mm',
	pgfdeclarelayer: 'm',
	pgfsetlayers: 'm',
	usetikzlibrary: 'm'
};

// pgfplots draws an axis's plots at its end, so a plot is marked as it is drawn, with the axis's own coordinates
// for its unit vectors: where data (0,0), (1,0) and (0,1) land
const PLOT_MARK = String.raw`\makeatletter\providecommand\tikzcapplot[1]{{%
\pgfplotspointaxisxy{0}{0}\pgfgetlastxy\tc@ox\tc@oy\pgfplotspointaxisxy{1}{0}\pgfgetlastxy\tc@px\tc@py%
\pgfplotspointaxisxy{0}{1}\pgfgetlastxy\tc@qx\tc@qy%
\pgf@xx=\dimexpr\tc@px-\tc@ox\relax\pgf@xy=\dimexpr\tc@py-\tc@oy\relax%
\pgf@yx=\dimexpr\tc@qx-\tc@ox\relax\pgf@yy=\dimexpr\tc@qy-\tc@oy\relax%
\pgftransformshift{\pgfqpoint{\tc@ox}{\tc@oy}}\tikzcapmark{#1}}}\makeatother`;

/** the end of the group that opens at `i`, matched by `close`, or -1 */
function groupEnd(text: string, i: number, close: string) {
	let depth = 0;
	for (let j = i; j < text.length; j++) {
		if (text[j] === '\\') j++;
		else if (text[j] === '{') depth++;
		else if (text[j] === '}') depth--;
		if (depth === 0 && text[j] === close) return j + 1;
		if (depth < 0) return -1;
	}
	return -1;
}

/** where a mandatory argument at `i` ends: a braced group, a control sequence or one character */
function mandatoryEnd(text: string, i: number) {
	if (text[i] === '{') return groupEnd(text, i, '}');
	const cs = /^\\(?:[a-zA-Z@]+|.)/.exec(text.slice(i));
	return cs ? i + cs[0].length : i < text.length ? i + 1 : -1;
}

/** the command at `at` with all its arguments, or null when one never closes */
function commandAt(text: string, at: number, name: string) {
	let i = at + name.length + 1;
	function skip() {
		while (/\s/.test(text[i] ?? '')) i++;
	}
	if (name === 'def') {
		// \def\name#1#2{...}
		while (i < text.length && text[i] !== '{') i++;
		const end = groupEnd(text, i, '}');
		return end < 0 ? null : text.slice(at, end);
	}
	if (name === 'tikzstyle') {
		// \tikzstyle{name}=[...], or +=[...]
		skip();
		i = mandatoryEnd(text, i);
		if (i < 0) return null;
		skip();
		const eq = /^\+?=\s*/.exec(text.slice(i));
		if (!eq) return text.slice(at, i);
		i += eq[0].length;
		const end = text[i] === '[' ? groupEnd(text, i, ']') : -1;
		return end < 0 ? null : text.slice(at, end);
	}
	for (const kind of ARGUMENTS[name] ?? '') {
		const before = i;
		skip();
		if (kind === 's') {
			if (text[i] === '*') i++;
			else i = before;
		} else if (kind === 'o') {
			if (text[i] !== '[') i = before;
			else if ((i = groupEnd(text, i, ']')) < 0) return null;
		} else if ((i = mandatoryEnd(text, i)) < 0) return null;
	}
	return text.slice(at, i);
}

/** the body's set-up before the picture, so the engine draws it as the document would; a definition inside an
 *  environment that closed before the picture (another figure, another picture) was local to it and stays out */
export function pictureContext(source: string, picture: Picture) {
	const body = source.indexOf('\\begin{document}');
	const before = source.slice(body < 0 ? 0 : body, picture.from).replace(/(^|[^\\])%[^\n]*/g, '$1');
	const open: string[][] = [[]];
	const TOKENS = new RegExp(String.raw`\\(begin|end)\{[^}]*\}|${SETUP.source}`, 'g');
	// what a replayed command holds (a definition inside a macro body) is not replayed again on its own
	let consumed = 0;
	for (const m of before.matchAll(TOKENS)) {
		if (m.index! < consumed) continue;
		if (m[1] === 'begin') open.push([]);
		else if (m[1] === 'end') {
			if (open.length > 1) open.pop();
		} else {
			const command = commandAt(before, m.index!, m[2]);
			if (!command) continue;
			consumed = m.index! + command.length;
			// a body may define the same macro before each figure; replayed, the last one wins as in the document
			const defined = /^\\(?:new|renew|provide)command\*?\s*\{?\s*(\\[a-zA-Z@]+)/.exec(command);
			const at = defined ? command.indexOf(defined[1]) : 0;
			open[open.length - 1].push(
				defined ? `\\providecommand${defined[1]}{}\\renewcommand${command.slice(command[at - 1] === '{' ? at - 1 : at)}` : command
			);
		}
	}
	return open.flat().join('\n');
}

/** a plot's marks as options of its own: its own as it is drawn, and its axis's again after it */
function plotHook(source: string, picture: Picture, st: Picture['statements'][number]) {
	const axis = picture.statements.find((a) => a.kind === 'axis' && a.from < st.from && st.to <= a.to);
	const hooks = `execute at begin plot visualization={\\tikzcapplot{${st.i}}}, execute at end plot visualization={\\tikzcapmark{${axis?.i ?? 0}}}`;
	const o = plotOptionSpan(source, st);
	// a plot without options keeps the axis's cycle of styles: `+` adds to them rather than replacing them
	if (o.empty) return { at: o.from, text: `${source[o.from - 1] === '+' ? '' : '+'}[${hooks}]` };
	return { at: o.from + 1, text: `${hooks}, ` };
}

/** where a path's own options end: a key there reads the transform its `scale=`, `shift=` or `x=` make */
function transformKey(source: string, st: Picture['statements'][number]) {
	if (st.kind !== 'path' && st.kind !== 'frame') return null;
	const options = readCommandOptions(source, st);
	if (!options) return null;
	const key = `tikzcap transform=${st.i}`;
	if (!options.span) return { at: options.insertAt, text: `[${key}]` };
	return { at: options.span.to - 1, text: options.items.length ? `, ${key}` : key };
}

/**
 * The picture as the engine gets it: its set-up, a mark before every statement, and mark 0 at the end for the picture's
 * own transform. Statements left out are blanked where they stand, so everything else keeps its place
 */
export function instrumentPicture(original: string, picture: Picture, leaveOut: readonly number[] = []) {
	const kept = picture.statements.filter((s) => !leaveOut.includes(s.i) && s.kind !== 'plot');
	let source = original;
	for (const s of picture.statements.filter((s) => leaveOut.includes(s.i)))
		source = source.slice(0, s.from) + source.slice(s.from, s.to).replace(/[^\n]/g, ' ') + source.slice(s.to);
	const { grid, forest } = picture as Picture & { grid?: CdGrid; forest?: ForestTree };
	const cuts = (
		grid
			? diagramCuts(source, { ...picture, grid }, kept)
			: forest
				? treeCuts({ ...picture, forest }, kept)
				: [
						...picture.statements.filter((s) => s.kind !== 'plot').map((s) => ({ at: s.from, text: `\\tikzcapmark{${s.i}}` })),
						...picture.statements.flatMap((s) => (s.kind === 'plot' && !leaveOut.includes(s.i) ? [plotHook(source, picture, s)] : [])),
						...kept.flatMap((s) => transformKey(source, s) ?? []),
						{ at: picture.endFrom, text: '\\tikzcapmark{0}' },
						...(picture.circuit ? pinCuts(source, picture, kept) : [])
					]
	).sort((a, b) => b.at - a.at);
	let text = source.slice(picture.from, picture.to);
	for (const c of cuts) {
		const at = c.at - picture.from;
		text = `${text.slice(0, at)}${c.text}${text.slice(at)}`;
	}
	const context = [
		pictureContext(source, picture),
		picture.statements.some((s) => s.kind === 'plot') ? PLOT_MARK : '',
		grid ? SLOT_MARK : '',
		picture.circuit ? PIN_MARK : '',
		forest ? TREE_MARK : ''
	]
		.filter(Boolean)
		.join('\n');
	return context ? `${context}\n${text}` : text;
}
