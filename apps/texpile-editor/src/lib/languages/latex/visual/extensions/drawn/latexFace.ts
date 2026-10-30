// what a LaTeX chip draws as, part by part; one part the editor cannot draw leaves the whole chip as source
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { BASE_PACKAGE_TABLE } from '$lib/languages/latex/parser/signatures/packageTable';
import { commonCommand } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { sourceUnitsIn, type SourceUnit } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import { bodyOf, type Stretch } from '$lib/languages/latex/parser/tree/walk/stretch';
import { hasStar, mandatoryArgs, type TreeArg, type TreeCall } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import { latexLigaturesToUnicode } from '$lib/languages/latex/parser/tree/convert/inlineRuns';
import { faceOfParts, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { commentFace } from '$lib/editor/visual/extensions/drawnChips/commentFace';
import { ACCENT_COMMANDS, ACCENTS, SYMBOLS, accentBase, accented } from '$lib/languages/latex/knowledge/commands/texCharacters';
import {
	DRAWN,
	HEAD,
	HORIZONTAL_SPACES,
	PAGE_BREAKS,
	REFERENCES,
	STYLED,
	SWITCHES,
	VERTICAL_SKIPS,
	type Look
} from '$lib/languages/latex/drawnCommands';
import { texLength, lengthLabel } from './texLength';
import { horizontalSpaceFace, verticalSpaceFace } from '$lib/editor/visual/extensions/drawnChips/spaceFace';
import { dividerFace } from '$lib/editor/visual/extensions/drawnChips/dividerFace';
import { footnoteFace } from '$lib/editor/visual/extensions/drawnChips/footnoteFace';
import { crossRefFace } from './crossRefFace.svelte';
import { ownMacroBody, ownMacroDefined, ownMacroDefinition, ownMacroFace } from './ownMacro/ownMacroFace.svelte';
import { macroCallName } from './ownMacro/ownMacroCall';
import { cssColor } from './texColor';

// a parse table leaves accents to the text beside the chip; the chip needs their letter as an argument
function signatureOf(name: string) {
	return ACCENT_COMMANDS.has(name) ? commonCommand(name)?.args : BASE_PACKAGE_TABLE.macros[name];
}

const MOST_DEPTH = 4;

/**
 * `top` is the chip's own run of nodes, where words mean text typed into it; `nextFootnote` counts the chip's footnotes
 * in order, for the numbers footnoteNumbers hands the chip
 */
type Drawing = { src: string; block: boolean; top: boolean; depth: number; nextFootnote(): number };

function worthParsing(source: string): boolean {
	const m = HEAD.exec(source);
	if (!m) return false;
	if (m[1]) return true;
	if (m[2]) return m[2] in SWITCHES;
	return DRAWN.has(m[3]) || ownMacroDefinition(m[3]) !== null;
}

function textPart(text: string): ChipFace {
	const dom = document.createElement('span');
	dom.textContent = text;
	return { dom };
}

function characterPart(text: string): ChipFace {
	return { ...textPart(text), character: true };
}

/** `parts` inside one element styled as `look`; a part on a line of its own cannot sit in a styled run */
function styledPart(look: Look, parts: ChipFace[], block: boolean): ChipFace | null {
	if (parts.some((part) => part.line)) return null;
	const face = faceOfParts(parts, block);
	const dom = document.createElement('span');
	Object.assign(dom.style, look);
	dom.appendChild(face.dom);
	return { dom, decorate: face.decorate, destroy: face.destroy };
}

function optional(d: Drawing, call: TreeCall): string | null {
	const arg = call.args.find((a) => a.present && a.open === '[');
	return arg ? argText(d, arg).trim() : null;
}
function argText(d: Drawing, arg: TreeArg | undefined): string {
	return arg?.body ? d.src.slice(arg.body.from, arg.body.to) : '';
}
function hasArgs(call: TreeCall): boolean {
	return call.args.some((a) => a.present);
}
function unitsIn(src: string, s: Stretch): SourceUnit[] {
	return sourceUnitsIn(src, s, signatureOf);
}
function argUnits(d: Drawing, arg: TreeArg | undefined): SourceUnit[] {
	return arg?.body ? unitsIn(d.src, arg.body) : [];
}

function ownMacroPart(name: string, source: string, d: Drawing): ChipFace | null {
	const body = ownMacroBody(name, source);
	if (body === null || d.depth >= MOST_DEPTH) return null;
	const inner: Drawing = { ...d, block: false, top: false, depth: d.depth + 1 };
	const probe = drawLatex(body, inner);
	probe?.destroy?.();
	return probe && !probe.line ? ownMacroFace(name, source, (latex) => drawLatex(latex, inner)) : null;
}

function coloredPart(color: string, parts: ChipFace[] | null): ChipFace | null {
	const css = cssColor(color);
	return css && parts ? styledPart({ color: css }, parts, false) : null;
}

function drawMacro(call: TreeCall, d: Drawing): ChipFace | ChipFace[] | null {
	const name = call.name;
	const source = d.src.slice(call.from, call.to);
	const args = mandatoryArgs(call);
	// the paper's own definition wins, even over a command the editor knows; one it cannot draw leaves the chip source
	if (!hasArgs(call) && ownMacroDefinition(name)) return ownMacroPart(name, source, d);
	if (name === 'vspace' || name === 'addvspace') {
		const length = argText(d, args[0]);
		return verticalSpaceFace(`\\${name}${hasStar(call) ? '*' : ''}`, texLength(length), lengthLabel(length), source);
	}
	if (name in VERTICAL_SKIPS) return verticalSpaceFace(`\\${name}`, { em: VERTICAL_SKIPS[name] / 10 }, `${VERTICAL_SKIPS[name]}pt`, source);
	if (name === 'vfill') return verticalSpaceFace('\\vfill', { fill: true }, '', source);
	if (name === 'hspace') return horizontalSpaceFace(texLength(argText(d, args[0])), source, true);
	if (name === 'hfill' || name === 'hfil') return horizontalSpaceFace({ fill: true }, source, true);
	if (name in HORIZONTAL_SPACES) return horizontalSpaceFace({ em: HORIZONTAL_SPACES[name] }, source, false);
	if (PAGE_BREAKS.has(name)) return dividerFace('Page break', source);
	if (name === 'appendix') return dividerFace('Appendix', source);
	if (name === 'bibliography') return dividerFace(`Bibliography · ${argText(d, args[0])}`, source);
	if (name === 'bibliographystyle') return dividerFace(`Bibliography style · ${argText(d, args[0])}`, source);
	if (name === 'footnote' || name === 'footnotemark') return footnoteFace(d.nextFootnote(), optional(d, call), argText(d, args[0]));
	if (name === 'footnotetext') return footnoteFace(null, optional(d, call), argText(d, args[0]));
	if (name in ACCENTS) {
		// a paper's own \d or \v (a differential, a vector) is no accent
		if (ownMacroDefined(name)) return null;
		const base = accentBase(argText(d, args[0]));
		return base ? characterPart(accented(name, base)) : null;
	}
	if (name in SYMBOLS && !hasArgs(call)) return characterPart(SYMBOLS[name]);
	if (name in STYLED) {
		const inner = drawUnits(argUnits(d, args[0]), d);
		return inner && styledPart(STYLED[name], inner, false);
	}
	if (name === 'texorpdfstring') return drawUnits(argUnits(d, args[0]), d);
	if (name === 'textcolor' && args.length === 2 && optional(d, call) === null)
		return coloredPart(argText(d, args[0]), drawUnits(argUnits(d, args[1]), d));
	if (REFERENCES.has(name)) {
		const target = name === 'hyperref' ? optional(d, call) : args[0] ? argText(d, args[0]) : null;
		// an empty {} or [] is still a reference (LaTeX prints ??), so the panel can give it its label
		if (target === null) return null;
		const labels = target
			.split(',')
			.map((label) => label.trim())
			.filter(Boolean);
		const shown = name === 'hyperref' ? argText(d, args[0]).replace(/~/g, '\u00a0') : null;
		return crossRefFace(hasStar(call) ? name + '*' : name, labels, shown, source);
	}
	if (name === 'xspace') return [];
	return null;
}

function isBlank(u: SourceUnit): boolean {
	return u.piece.kind === 'space' || (u.piece.kind === 'node' && (u.piece.node.name === 'Comment' || u.piece.node.name === 'ParBreak'));
}

function drawGroup(units: SourceUnit[], d: Drawing): ChipFace | ChipFace[] | null {
	const first = units.findIndex((u) => !isBlank(u));
	if (first < 0) return [];
	const head = units[first].call;
	if (head && head.name in SWITCHES && !hasArgs(head)) {
		const inner = drawUnits(units.slice(first + 1), d);
		return inner && styledPart(SWITCHES[head.name], inner, false);
	}
	const color = head?.name === 'color' ? head.args.filter((arg) => arg.present && arg.open) : null;
	if (color?.length === 1 && color[0].open === '{') return coloredPart(argText(d, color[0]), drawUnits(units.slice(first + 1), d));
	return drawUnits(units, d);
}

const TEXT_NODES = new Set(['OpenBracket', 'CloseBracket']);

/** the parts `units` draw as, or null when one of them cannot be drawn */
function drawUnits(units: SourceUnit[], d: Drawing): ChipFace[] | null {
	const parts: ChipFace[] = [];
	let comments: string[] = [];
	// TeX drops the space after a control word
	let afterWord = true;
	let space = false;
	// a space between two parts in the text; beside a part on a line of its own it would be a blank line
	function add(part: ChipFace): void {
		const before = parts[parts.length - 1];
		if (space && before && !before.line && !part.line) parts.push(textPart(' '));
		space = false;
		parts.push(part);
	}
	function flushComments(): void {
		if (comments.length) add(commentFace(comments, '%'));
		comments = [];
	}
	function fail(): null {
		parts.forEach((part) => part.destroy?.());
		return null;
	}
	const inner: Drawing = { ...d, top: false };
	for (let i = 0; i < units.length; i++) {
		const { piece, call } = units[i];
		const nodeName = piece.kind === 'node' ? piece.node.name : null;
		if (nodeName === 'Comment') {
			comments.push(d.src.slice(piece.from + 1, piece.to).replace(/^ /, ''));
			afterWord = true;
			continue;
		}
		if (piece.kind === 'space' || nodeName === 'ParBreak') {
			if (!afterWord && !comments.length) space = true;
			afterWord = true;
			continue;
		}
		flushComments();
		if (piece.kind === 'word' || (nodeName && TEXT_NODES.has(nodeName))) {
			// words standing in the chip itself are text the reader typed into it, not something it prints
			if (d.top) return fail();
			add(textPart(latexLigaturesToUnicode(d.src.slice(piece.from, piece.to)).replace(/~/g, '\u00a0')));
			afterWord = false;
			continue;
		}
		if (nodeName === 'Group' && piece.kind === 'node') {
			const drawn = drawGroup(unitsIn(d.src, bodyOf(piece.node)), inner);
			if (!drawn) return fail();
			(Array.isArray(drawn) ? drawn : [drawn]).forEach(add);
			afterWord = false;
			continue;
		}
		if (!call) return fail();
		// \vskip and \hskip take TeX's own length syntax, which runs to the end of the chip
		if (call.name === 'vskip' || call.name === 'hskip') {
			const end = units[units.length - 1].call?.to ?? units[units.length - 1].piece.to;
			const rest = d.src.slice(piece.to, end).trim();
			const length = texLength(rest);
			const source = d.src.slice(piece.from, end);
			add(
				call.name === 'vskip' ? verticalSpaceFace('\\vskip', length, lengthLabel(rest), source) : horizontalSpaceFace(length, source, true)
			);
			break;
		}
		const drawn = drawMacro(call, inner);
		if (!drawn) return fail();
		(Array.isArray(drawn) ? drawn : [drawn]).forEach(add);
		afterWord = !hasArgs(call) && /^[a-zA-Z@]+$/.test(call.name);
	}
	flushComments();
	return parts;
}

// a paper repeats its chips (the same \cref, the same macro), so their units are kept
const parsed = new Map<string, SourceUnit[]>();
const MOST_KEPT = 2000;

function drawLatex(source: string, d: Drawing): ChipFace | null {
	let units = parsed.get(source);
	if (!units) {
		units = unitsIn(source, bodyOf(latexTreeOf(source).topNode));
		if (parsed.size >= MOST_KEPT) parsed.clear();
		parsed.set(source, units);
	}
	const parts = drawUnits(units, { ...d, src: source });
	return parts && parts.length ? faceOfParts(parts, d.block) : null;
}

/** the drawing of a chip's source, or null when it stays source */
export function latexFace(source: string, block: boolean): ChipFace | null {
	if (!worthParsing(source)) return null;
	let footnotes = 0;
	function nextFootnote(): number {
		return footnotes++;
	}
	const d: Drawing = { src: source, block, top: true, depth: 0, nextFootnote };
	// a call with arguments draws only as the whole chip: the parse leaves its arguments beside it
	const own = macroCallName(source);
	if (own && ownMacroDefinition(own)?.args) return ownMacroPart(own, source, d);
	return drawLatex(source, d);
}
