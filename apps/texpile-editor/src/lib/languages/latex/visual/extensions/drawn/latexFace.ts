// what a LaTeX chip draws as, part by part; one part the editor cannot draw leaves the whole chip as source
import type { Argument, Macro, Node } from '@unified-latex/unified-latex-types';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { createLatexParser } from '$lib/languages/latex/parser/parser';
import { latexLigaturesToUnicode } from '$lib/languages/latex/parser/convert/inlineConvert';
import { faceOfParts, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { commentFace } from '$lib/editor/visual/extensions/drawnChips/commentFace';
import { ACCENTS, SYMBOLS, accentBase, accented } from '$lib/languages/latex/texCharacters';
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
import { ownMacroDefined, ownMacroDefinition, ownMacroFace } from './ownMacroFace.svelte';

const SIGNATURES: Record<string, { signature: string }> = {
	vspace: { signature: 's m' },
	hspace: { signature: 's m' },
	addvspace: { signature: 'm' },
	footnote: { signature: 'o m' },
	footnotemark: { signature: 'o' },
	footnotetext: { signature: 'o m' },
	pagebreak: { signature: 'o' },
	bibliography: { signature: 'm' },
	bibliographystyle: { signature: 'm' },
	texorpdfstring: { signature: 'm m' },
	hyperref: { signature: 'o m' },
	eqref: { signature: 'm' },
	...Object.fromEntries(
		['ref', 'cref', 'Cref', 'autoref', 'Autoref', 'pageref', 'nameref', 'Nameref'].map((name) => [name, { signature: 's m' }])
	),
	...Object.fromEntries(Object.keys(STYLED).map((name) => [name, { signature: 'm' }])),
	...Object.fromEntries(Object.keys(ACCENTS).map((name) => [name, { signature: 'm' }]))
};

const MOST_DEPTH = 4;

/**
 * `top` is the chip's own run of nodes, where words mean text typed into it; `nextFootnote` counts the chip's footnotes
 * in order, for the numbers footnoteNumbers hands the chip
 */
type Drawing = { block: boolean; top: boolean; depth: number; nextFootnote(): number };

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

function mandatory(macro: Macro): Argument[] {
	return (macro.args ?? []).filter((arg) => arg.openMark === '{');
}
function optional(macro: Macro): string | null {
	const arg = (macro.args ?? []).find((a) => a.openMark === '[');
	return arg ? printRaw(arg.content).trim() : null;
}
function starred(macro: Macro): boolean {
	return (macro.args ?? []).some((a) => a.openMark === '' && a.content.length > 0);
}
function argText(arg: Argument | undefined): string {
	return arg ? printRaw(arg.content) : '';
}

function drawMacro(macro: Macro, d: Drawing): ChipFace | ChipFace[] | null {
	const name = macro.content;
	const source = printRaw(macro);
	const args = mandatory(macro);
	// the paper's own definition wins, even over a command the editor knows; one it cannot draw leaves the chip source
	const definition = macro.args?.length ? null : ownMacroDefinition(name);
	if (definition) {
		if (d.depth >= MOST_DEPTH) return null;
		const inner: Drawing = { ...d, block: false, top: false, depth: d.depth + 1 };
		const probe = drawLatex(definition.def, inner);
		probe?.destroy?.();
		return probe && !probe.line ? ownMacroFace(name, source, (latex) => drawLatex(latex, inner)) : null;
	}
	if (name === 'vspace' || name === 'addvspace') {
		const length = argText(args[0]);
		return verticalSpaceFace(`\\${name}${starred(macro) ? '*' : ''}`, texLength(length), lengthLabel(length), source);
	}
	if (name in VERTICAL_SKIPS) return verticalSpaceFace(`\\${name}`, { em: VERTICAL_SKIPS[name] / 10 }, `${VERTICAL_SKIPS[name]}pt`, source);
	if (name === 'vfill') return verticalSpaceFace('\\vfill', { fill: true }, '', source);
	if (name === 'hspace') return horizontalSpaceFace(texLength(argText(args[0])), source, true);
	if (name === 'hfill' || name === 'hfil') return horizontalSpaceFace({ fill: true }, source, true);
	if (name in HORIZONTAL_SPACES) return horizontalSpaceFace({ em: HORIZONTAL_SPACES[name] }, source, false);
	if (PAGE_BREAKS.has(name)) return dividerFace('Page break', source);
	if (name === 'appendix') return dividerFace('Appendix', source);
	if (name === 'bibliography') return dividerFace(`Bibliography · ${argText(args[0])}`, source);
	if (name === 'bibliographystyle') return dividerFace(`Bibliography style · ${argText(args[0])}`, source);
	if (name === 'footnote' || name === 'footnotemark') return footnoteFace(d.nextFootnote(), optional(macro), argText(args[0]));
	if (name === 'footnotetext') return footnoteFace(null, optional(macro), argText(args[0]));
	if (name in ACCENTS) {
		// a paper's own \d or \v (a differential, a vector) is no accent
		if (ownMacroDefined(name)) return null;
		const base = accentBase(argText(args[0]));
		return base ? characterPart(accented(name, base)) : null;
	}
	if (name in SYMBOLS && !macro.args?.length) return characterPart(SYMBOLS[name]);
	if (name in STYLED) {
		const inner = drawNodes(args[0]?.content ?? [], d);
		return inner && styledPart(STYLED[name], inner, false);
	}
	if (name === 'texorpdfstring') return drawNodes(args[0]?.content ?? [], d);
	if (REFERENCES.has(name)) {
		const target = name === 'hyperref' ? optional(macro) : args[0]?.openMark === '{' ? argText(args[0]) : null;
		// an empty {} or [] is still a reference (LaTeX prints ??), so the panel can give it its label
		if (target === null) return null;
		const labels = target
			.split(',')
			.map((label) => label.trim())
			.filter(Boolean);
		const shown = name === 'hyperref' ? argText(args[0]).replace(/~/g, '\u00a0') : null;
		return crossRefFace(starred(macro) ? name + '*' : name, labels, shown, source);
	}
	if (name === 'xspace') return [];
	return null;
}

function drawGroup(content: Node[], d: Drawing): ChipFace | ChipFace[] | null {
	const first = content.findIndex((n) => n.type !== 'whitespace' && n.type !== 'comment');
	if (first < 0) return [];
	const head = content[first];
	if (head.type === 'macro' && head.content in SWITCHES && !head.args?.length) {
		const inner = drawNodes(content.slice(first + 1), d);
		return inner && styledPart(SWITCHES[head.content], inner, false);
	}
	return drawNodes(content, d);
}

/** the parts `nodes` draw as, or null when one of them cannot be drawn */
function drawNodes(nodes: Node[], d: Drawing): ChipFace[] | null {
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
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node.type === 'comment') {
			comments.push(node.content.replace(/^ /, ''));
			afterWord = true;
			continue;
		}
		if (node.type === 'whitespace' || node.type === 'parbreak') {
			if (!afterWord && !comments.length) space = true;
			afterWord = true;
			continue;
		}
		flushComments();
		if (node.type === 'string') {
			// words standing in the chip itself are text the reader typed into it, not something it prints
			if (d.top) return fail();
			add(textPart(latexLigaturesToUnicode(node.content).replace(/~/g, '\u00a0')));
			afterWord = false;
			continue;
		}
		if (node.type === 'group') {
			const drawn = drawGroup(node.content, inner);
			if (!drawn) return fail();
			(Array.isArray(drawn) ? drawn : [drawn]).forEach(add);
			afterWord = false;
			continue;
		}
		if (node.type !== 'macro') return fail();
		// \vskip and \hskip take TeX's own length syntax, which runs to the end of the chip
		if (node.content === 'vskip' || node.content === 'hskip') {
			const rest = printRaw(nodes.slice(i + 1)).trim();
			const length = texLength(rest);
			const source = printRaw(nodes.slice(i));
			add(
				node.content === 'vskip'
					? verticalSpaceFace('\\vskip', length, lengthLabel(rest), source)
					: horizontalSpaceFace(length, source, true)
			);
			break;
		}
		const drawn = drawMacro(node, inner);
		if (!drawn) return fail();
		(Array.isArray(drawn) ? drawn : [drawn]).forEach(add);
		afterWord = !node.args?.length && /^[a-zA-Z@]+$/.test(node.content);
	}
	flushComments();
	return parts;
}

// built once, and a paper repeats its chips (the same \cref, the same macro), so their trees are kept
let parse: ((source: string) => { content: Node[] }) | null = null;
const parsed = new Map<string, Node[]>();
const MOST_KEPT = 2000;

function drawLatex(source: string, d: Drawing): ChipFace | null {
	let nodes = parsed.get(source);
	if (!nodes) {
		try {
			parse ??= createLatexParser({ macros: SIGNATURES });
			nodes = parse(source).content;
		} catch {
			return null;
		}
		if (parsed.size >= MOST_KEPT) parsed.clear();
		parsed.set(source, nodes);
	}
	const parts = drawNodes(nodes, d);
	return parts && parts.length ? faceOfParts(parts, d.block) : null;
}

/** the drawing of a chip's source, or null when it stays source */
export function latexFace(source: string, block: boolean): ChipFace | null {
	if (!worthParsing(source)) return null;
	let footnotes = 0;
	function nextFootnote(): number {
		return footnotes++;
	}
	return drawLatex(source, { block, top: true, depth: 0, nextFootnote });
}
