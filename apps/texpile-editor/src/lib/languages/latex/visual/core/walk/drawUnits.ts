// what a LaTeX chip draws as, part by part; one part the editor cannot draw leaves the whole chip as source
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import type { SourceUnit } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import { bodyOf, environmentName } from '$lib/languages/latex/parser/tree/walk/stretch';
import type { SyntaxNode } from '@lezer/common';
import { mandatoryArgs, type TreeArg, type TreeCall } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import { latexLigaturesToUnicode } from '$lib/languages/latex/parser/tree/convert/inlineRuns';
import { faceOfParts, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { commentFace } from '$lib/editor/visual/extensions/drawnChips/commentFace';
import { SWITCHES } from '$lib/languages/latex/drawnCommands';
import { texLength, lengthLabel } from '../reading/texLength';
import { horizontalSpaceFace, verticalSpaceFace } from '$lib/editor/visual/extensions/drawnChips/spaceFace';
import { ownMacroArguments, ownMacroDefinition } from '../own/ownMacroFace.svelte';
import { isMacroAlias, macroCallName } from '../own/ownMacroCall';
import { MOST_DEPTH, ownMacroPart } from '../own/ownMacroPart';
import { isInlineMath } from '../parts/inlineMath';
import { holdsRunningText, textEnvironmentFace } from './textEnvironmentFace';
import { quietRunAt } from '../definitions/quietRun';
import { addressFace, titleMacro, type TitleScope } from '../title/titleLines';
import { titleMarkup } from '../title/titleMarkup';
import { wrappedArgument } from '../own/layoutWrapper';
import { titleMath } from '../title/titleMath';
import { switchFace } from '../parts/switchFace';
import { kernRun } from './kernRun';
import { coloredPart, styledPart, textPart } from '../parts/textParts';
import { printedArguments } from '../parts/printedArguments';
import { declaredLook } from '../parts/declarationLook';
import { mathPart } from '../parts/mathPart';
import { mathWithCallsPart } from '../parts/mathWithCalls';
import { isTheoremCommand, ownMathRun, theoremCommandFace } from '../own/ownMathRun';
import { declaresSetting, printsNothing, readsAsData } from '../parts/plainCommands';
import { argText, destroyParts, endsNothing, hasArgs, isBlank, isTextPiece, partsOf, type Drawing } from '../reading/drawing';
import { argUnits, signatureOf, unitsIn, unitsOf } from '../reading/chipUnits';
import { primitiveAt } from '../reading/primitiveUnits';
import { worthParsing } from './worthParsing';
import { encodedText } from '../encodings/encodedText';
import { switchedEncoding, wrappedEncoding } from '../encodings/encodingSwitch';
import { commandPlugins, environmentPlugins } from '../plugin/pluginMap';
import type { LatexFaceAnswer, LatexFaceCore, LatexPart, LatexPlugin } from '../plugin/latexPlugin';
import { faceCoreOf, type DrawingWalk } from './faceCore';
import { wholeEnvironmentFace } from './wholeEnvironment';

const MATH = new Set(['InlineMath', 'ParenMath', 'DisplayMath', 'BracketMath']);

/** the first plugin's answer; for an environment, the first that draws it */
function answerOf(plugins: readonly LatexPlugin[], part: LatexPart, core: LatexFaceCore): LatexFaceAnswer {
	for (const plugin of plugins) {
		const answer = plugin.face?.(part, core);
		if (answer !== undefined && !(answer === null && part.kind === 'environment')) return answer;
	}
	return undefined;
}

/** a macro of the paper that only sets its argument apart, drawn as an address under the authors */
function ownAddressPart(name: string, source: string, d: Drawing): ChipFace | null {
	const text = wrappedArgument(name, source);
	if (text === null) return null;
	const title: TitleScope = { part: 'affiliation', marks: d.titleMarks };
	const parts = partsOf(drawGroup(unitsIn(text, bodyOf(latexTreeOf(text).topNode), true), { ...d, src: text, top: false, title }));
	return parts && addressFace(parts, source);
}

function drawMacro(call: TreeCall, d: Drawing): ChipFace | ChipFace[] | null {
	// a backslash before a line end is the control space as well
	const name = /^\s$/.test(call.name) ? ' ' : call.name;
	const source = d.src.slice(call.from, call.to);
	const args = mandatoryArgs(call);
	const plugins = commandPlugins(name);
	const part: LatexPart = { kind: 'command', name, call };
	const core = faceCoreOf(d, source, WALK);
	const over = answerOf(
		plugins.filter((plugin) => plugin.overDefinition),
		part,
		core
	);
	if (over !== undefined) return over;
	// the paper's own definition wins, even over a command the editor knows; one it cannot draw leaves the chip source
	if (ownMacroDefinition(name) && (!hasArgs(call) || ownMacroArguments(name))) {
		const own = ownMacroPart(name, source, d, drawParts);
		if (own) return own;
		if (!hasArgs(call) && !d.title && !readsAsData(name)) return null;
	}
	const titled = titleMacro(
		call,
		d.title,
		d.src,
		(body, title) => partsOf(drawGroup(unitsIn(d.src, body, true), { ...d, top: false, title })),
		d.titleMarks
	);
	if (titled !== undefined) return titled;
	if (!hasArgs(call) && isTheoremCommand(name)) return theoremCommandFace(name, source);
	const answer = answerOf(
		plugins.filter((plugin) => !plugin.overDefinition),
		part,
		core
	);
	if (answer !== undefined) return answer;
	if ((declaresSetting(name) || printsNothing(name)) && !hasArgs(call)) return switchFace(name, source);
	const wrapped = wrappedEncoding(call);
	if (wrapped) return drawArguments(args, { ...d, encoding: wrapped });
	const text = printedArguments(call, signatureOf(name), (arg) => argText(d, arg));
	if (text) return drawArguments(text, d);
	return d.title ? titleMarkup(call, signatureOf(name), (arg) => partsOf(drawGroup(argUnits(d, arg), d))) : null;
}

/** the text of arguments, one after another */
function drawArguments(args: TreeArg[], d: Drawing): ChipFace[] | null {
	const parts: ChipFace[] = [];
	for (const arg of args) {
		const drawn = partsOf(drawGroup(argUnits(d, arg), d));
		if (!drawn) return destroyParts(parts) ?? null;
		parts.push(...drawn);
	}
	return parts;
}

function drawGroup(units: SourceUnit[], d: Drawing): ChipFace | ChipFace[] | null {
	const first = units.findIndex((u) => !isBlank(u));
	if (first < 0) return [];
	const head = units[first].call;
	if (head && declaresSetting(head.name) && !hasArgs(head) && units.slice(first + 1).every((u) => endsNothing(u, d)))
		return switchFace(head.name, d.src);
	// an alignment switch aligns the paragraph, which the drawing leaves as it is
	if (head && !hasArgs(head) && commonFacts(head.name).declares === 'align') return drawUnits(units.slice(first + 1), d);
	if (head && Object.hasOwn(SWITCHES, head.name) && !hasArgs(head)) {
		const inner = drawUnits(units.slice(first + 1), d);
		// a display in the group stands on its own line, outside any run the switch could style
		return inner && (styledPart(SWITCHES[head.name], inner, false) ?? inner);
	}
	const color = head?.name === 'color' ? head.args.filter((arg) => arg.present && arg.open) : null;
	if (color?.length === 1 && color[0].open === '{') return coloredPart(argText(d, color[0]), drawUnits(units.slice(first + 1), d));
	return drawUnits(units, d);
}

/** the math holds one command and nothing else, in braces or not */
function soleCommandOf(units: SourceUnit[], d: Drawing): string | null {
	const [first, ...rest] = units.filter((u) => !isBlank(u));
	if (first?.call) return rest.every((u) => !u.call) ? first.call.name : null;
	const group = !rest.length && first?.piece.kind === 'node' && first.piece.node.name === 'Group' ? first.piece.node : null;
	return group && soleCommandOf(unitsIn(d.src, bodyOf(group), !!d.title), d);
}

function asFace(answer: LatexFaceAnswer): ChipFace | null {
	return Array.isArray(answer) ? faceOfParts(answer, false) : (answer ?? null);
}

/** \begin{raggedright} and the other declarations written as environments, and environments of running text, around what they hold */
function declarationPart(node: SyntaxNode, name: string, d: Drawing): ChipFace | null {
	const declared = !!name && declaresSetting(name);
	if (!name || !(declared || holdsRunningText(name))) return null;
	const parts = drawUnits(unitsIn(d.src, bodyOf(node), !!d.title), d);
	if (!parts?.length) return null;
	if (!declared) return d.title ? faceOfParts(parts, false) : textEnvironmentFace(name, parts, d.src.slice(node.from, node.to));
	return Object.hasOwn(SWITCHES, name) ? styledPart(SWITCHES[name], parts, false) : faceOfParts(parts, false);
}

/** math, an environment, or math that holds a command the plugins draw */
function nodePart(node: SyntaxNode, d: Drawing): ChipFace | null {
	const math = mathPart(d.src, node);
	if (math) return math;
	const core = faceCoreOf(d, d.src.slice(node.from, node.to), WALK);
	if (MATH.has(node.name)) {
		const name = soleCommandOf(unitsIn(d.src, bodyOf(node), !!d.title), d);
		const answer = name ? asFace(answerOf(commandPlugins(name), { kind: 'math', name, node }, core)) : null;
		return answer ?? mathWithCallsPart(node, d.src, core.drawSource);
	}
	const name = node.name === 'Environment' && node.firstChild ? environmentName(d.src, node.firstChild) : '';
	return (name && asFace(answerOf(environmentPlugins(name), { kind: 'environment', name, node }, core))) || declarationPart(node, name, d);
}

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
		// a separator that prints a comma (\sep) unskips the space before it
		const unskips = part.character && /^[,;]/.test(part.dom.textContent ?? '');
		if (space && before && !before.line && !part.line && !unskips) parts.push(textPart(' '));
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
			// the title block prints no comments
			if (!d.title) comments.push(d.src.slice(piece.from + 1, piece.to).replace(/^ /, ''));
			afterWord = true;
			continue;
		}
		if (piece.kind === 'space' || nodeName === 'ParBreak') {
			if (!afterWord && !comments.length) space = true;
			afterWord = true;
			continue;
		}
		flushComments();
		if (isTextPiece(units[i])) {
			// words standing in the chip itself are text the reader typed into it, not something it prints; a ~ is a space
			if (d.top && !/^[~\u00a0]+$/.test(d.src.slice(piece.from, piece.to))) return fail();
			if (d.encoding) {
				// the word and the punctuation glued to it are one run for the font's ligatures
				let end = i;
				while (end + 1 < units.length && isTextPiece(units[end + 1])) end++;
				add(textPart(encodedText(d.src.slice(piece.from, units[end].piece.to), d.encoding)));
				i = end;
			} else add(textPart(latexLigaturesToUnicode(d.src.slice(piece.from, piece.to)).replace(/~/g, '\u00a0')));
			afterWord = false;
			continue;
		}
		if (isInlineMath(nodeName) && piece.kind === 'node') {
			// a formula standing in the chip itself is text typed into it, like a word
			if (d.top) return fail();
			const formula = mathPart(d.src, piece.node);
			if (!formula) return fail();
			add(formula);
			afterWord = false;
			continue;
		}
		if (nodeName === 'Verb') {
			const text = d.src.slice(piece.from, piece.to);
			const name = /^\\([a-zA-Z]+)/.exec(text)?.[1] ?? '';
			const drawn = partsOf(
				answerOf(commandPlugins(name), { kind: 'verbatim', name, source: text }, faceCoreOf(inner, text, WALK)) ?? null
			);
			if (!drawn) return fail();
			drawn.forEach(add);
			afterWord = false;
			continue;
		}
		if (nodeName === 'Group' && piece.kind === 'node') {
			const drawn = drawGroup(unitsIn(d.src, bodyOf(piece.node), !!d.title), inner);
			if (!drawn) return fail();
			(Array.isArray(drawn) ? drawn : [drawn]).forEach(add);
			afterWord = false;
			continue;
		}
		const math = (d.title && titleMath(piece, d.src)) || (piece.kind === 'node' && !call ? nodePart(piece.node, inner) : null);
		if (math) {
			add(math);
			afterWord = false;
			continue;
		}
		if (!call) return fail();
		const encoding = switchedEncoding(call, d);
		if (encoding) {
			const rest = drawUnits(units.slice(i + 1), { ...d, encoding });
			if (!rest) return fail();
			rest.forEach(add);
			break;
		}
		const primitive = primitiveAt(units, i, d.src);
		if (primitive) {
			const latex = primitive.name && `\\${primitive.name}`;
			const drawn = !latex ? [] : d.depth < MOST_DEPTH ? drawParts(latex, { ...inner, depth: d.depth + 1 }) : null;
			if (!drawn) return fail();
			drawn.forEach(add);
			i = primitive.next - 1;
			afterWord = true;
			continue;
		}
		// shown as a setting only where it is written in the paper's text
		if (!d.top && printsNothing(call.name) && !declaresSetting(call.name) && !hasArgs(call)) {
			afterWord = /^[a-zA-Z@]+$/.test(call.name);
			continue;
		}
		const quiet = quietRunAt(units, i, d.src, (latex) =>
			d.depth < MOST_DEPTH ? drawLatex(latex, { ...inner, block: false, depth: d.depth + 1 }) : null
		);
		if (quiet) {
			add(quiet.part);
			i = quiet.next - 1;
			afterWord = true;
			continue;
		}
		// a switch after the start of the text styles the rest of it
		if (!d.top && Object.hasOwn(SWITCHES, call.name) && !hasArgs(call)) {
			const rest = drawUnits(units.slice(i + 1), d);
			const styled = rest && styledPart(SWITCHES[call.name], rest, false);
			if (!styled) return fail();
			add(styled);
			break;
		}
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
		// a switch inside a run styles the rest of it, as TeX does to the rest of its group
		if (Object.hasOwn(SWITCHES, call.name) && !hasArgs(call) && i < units.length - 1) {
			const rest = drawUnits(units.slice(i + 1), inner);
			const styled = rest?.length ? styledPart(SWITCHES[call.name], rest, false) : null;
			if (rest && !rest.length) add(switchFace(call.name, d.src.slice(call.from, call.to)));
			else if (!styled) return fail();
			else add(styled);
			break;
		}
		// a declaration that takes its setting as an argument styles the rest as a switch does
		if (hasArgs(call) && declaresSetting(call.name) && !Object.hasOwn(SWITCHES, call.name)) {
			const rest = drawUnits(units.slice(i + 1), inner);
			if (!rest) return fail();
			const look = declaredLook(
				call.name,
				mandatoryArgs(call).map((arg) => argText(d, arg))
			);
			const styled = rest.length ? styledPart(look, rest, false) : switchFace(call.name, d.src.slice(call.from, call.to));
			if (!styled) return fail();
			add(styled);
			break;
		}
		// the logos' own boxes: \kern<length> and \lower<length>\hbox{...}
		if (call.name === 'kern' || call.name === 'lower' || call.name === 'raise') {
			const run = kernRun(units, i, d.src, (unit) => drawUnits([unit], inner));
			if (!run) return fail();
			run.parts.forEach(add);
			i += run.skip;
			afterWord = run.afterWord;
			continue;
		}
		const drawn = drawMacro(call, inner);
		if (!drawn) return fail();
		(Array.isArray(drawn) ? drawn : [drawn]).forEach(add);
		afterWord = !hasArgs(call) && /^[a-zA-Z@]+$/.test(call.name);
	}
	flushComments();
	return parts;
}

function drawParts(source: string, d: Drawing): ChipFace[] | null {
	return drawUnits(unitsOf(source), { ...d, src: source });
}

function drawLatex(source: string, d: Drawing): ChipFace | null {
	const parts = drawParts(source, d);
	return parts && parts.length ? faceOfParts(parts, d.block) : null;
}

const WALK: DrawingWalk = { group: drawGroup, units: drawUnits, latex: drawLatex, arguments: drawArguments };

/** the drawing of a chip's source, or null when it stays source */
export function latexFace(source: string, block: boolean): ChipFace | null {
	const run = ownMathRun(source);
	if (run) return run;
	let footnotes = 0;
	function nextFootnote(): number {
		return footnotes++;
	}
	let notes = 0;
	const d: Drawing = { src: source, block, top: true, depth: 0, nextFootnote, titleMarks: { next: () => notes++ } };
	const skipped = /^\s*\\begin/.test(source) ? wholeEnvironmentFace(source, faceCoreOf(d, source, WALK)) : null;
	if (skipped) return skipped;
	if (!worthParsing(source)) return null;
	// a call with arguments draws only as the whole chip: the parse leaves its arguments beside it
	const own = macroCallName(source);
	const definition = own ? ownMacroDefinition(own) : null;
	if (own && definition && (definition.args || isMacroAlias(definition))) {
		const part = ownAddressPart(own, source, d) ?? ownMacroPart(own, source, d, drawParts);
		if (part && !Array.isArray(part)) return part;
	}
	const parts = drawParts(source, d);
	// a chip of commands that print nothing shows quiet
	if (parts && !parts.length && own) return switchFace(own, source);
	return parts && parts.length ? faceOfParts(parts, block) : null;
}
