import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { Tree } from '@lezer/common';
import type { MacroCompletion } from '../packages/packageCompletions';
import { docText } from '$lib/editor/source/docText';
import type { LoadedFile } from '../../knowledge/loadedFiles';
import { commonEnvFacts, loadedEnvFacts, type EnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { NOT_DELIMITER, verbatimArgumentEnd, verbatimArgumentStart, verbatimCommandNames } from '../../knowledge/calls/verbatimCalls';
import { documentReading } from '../signature/documentReadings';
import { ownMathIn } from '../../source/latexOwnSyntax';
import { literalAt, modeFromTree, type ModeReadings } from '../../syntax/treeMode';
import { documentWrapperIn, documentWrapperOf } from '../../syntax/documentWrapper';

const PARSE_BUDGET_MS = 100;
const verbatimCommands = new Set(verbatimCommandNames());

const factsCache = new WeakMap<LoadedFile[], (name: string) => EnvFacts>();

// what the loaded packages say about an environment over the common reading
function factsOf(loaded: LoadedFile[] | null): (name: string) => EnvFacts {
	if (!loaded) return commonEnvFacts;
	let facts = factsCache.get(loaded);
	if (!facts) {
		const stacked = loadedEnvFacts(loaded);
		facts = (name) => (stacked[name] ? { ...commonEnvFacts(name), ...stacked[name] } : commonEnvFacts(name));
		factsCache.set(loaded, facts);
	}
	return facts;
}

export function latexTreeAt(state: EditorState, pos: number): Tree | null {
	const tree = ensureSyntaxTree(state, pos, PARSE_BUDGET_MS) ?? syntaxTree(state);
	return tree.length >= pos ? tree : null;
}

function readingsOf(state: EditorState, text: string, loaded: LoadedFile[] | null): ModeReadings {
	return { envFacts: factsOf(loaded), commandReading: (name) => documentReading(loaded, text, name), own: ownMathIn(state) };
}

export type CompletionMode = 'math' | 'text';

/** the mode at pos; null in a preamble, a definition body, a comment, verbatim text and where the parse has not reached */
export function modeAt(state: EditorState, pos: number, loaded: LoadedFile[] | null = null): CompletionMode | null {
	const tree = latexTreeAt(state, pos);
	if (!tree) return null;
	const text = docText(state.doc);
	// a parse that stops short of the \begin{document} cannot tell a preamble from a fragment
	const wrapper = documentWrapperIn(text, tree) ?? (tree.length < text.length ? documentWrapperOf(text) : null);
	return modeFromTree(tree, text, pos, wrapper?.begin.to ?? 0, readingsOf(state, text, loaded));
}

/** true when pos sits inside $...$, \(...\), \[...\], $$...$$ or a math environment, preamble included */
export function isMathContext(state: EditorState, pos: number, loaded: LoadedFile[] | null = null): boolean {
	const tree = latexTreeAt(state, pos);
	const text = docText(state.doc);
	return !!tree && modeFromTree(tree, text, pos, 0, readingsOf(state, text, loaded)) === 'math';
}

function inOpenVerb(tree: Tree, state: EditorState, pos: number): boolean {
	let open = false;
	tree.iterate({
		from: state.doc.lineAt(pos).from,
		to: pos,
		enter(node) {
			const name = state.sliceDoc(node.from + 1, node.to);
			if (node.name !== 'ControlWord' || !verbatimCommands.has(name)) return;
			const call = state.sliceDoc(node.from, pos);
			const start = verbatimArgumentStart(call, node.to - node.from, name);
			if (start >= 0 && start < call.length && !NOT_DELIMITER.test(call[start]) && verbatimArgumentEnd(call, start, name) < 0) open = true;
		}
	});
	return open;
}

export function isLiteralAt(state: EditorState, pos: number): boolean {
	const tree = latexTreeAt(state, pos);
	if (!tree) return false;
	const literal = literalAt(tree, pos);
	return literal === 'VerbatimBody' || literal === 'Verb' || inOpenVerb(tree, state, pos);
}

export function isCommentAt(state: EditorState, pos: number): boolean {
	const found = latexTreeAt(state, pos);
	return !!found && literalAt(found, pos) === 'Comment';
}

const IN_MATH_BOOST = 12;
const OUT_OF_MATH_SINK = -6;

/** re-ranks math-flagged macro completions for the given context; composes with frecency boosts. */
export function withMathBoost(options: MacroCompletion[], inMath: boolean): MacroCompletion[] {
	const delta = inMath ? IN_MATH_BOOST : OUT_OF_MATH_SINK;
	return options.map((o) => (o.math ? { ...o, boost: (o.boost ?? 0) + delta } : o));
}

const TEXT_ONLY_SINK = -50;

/** outside math the math-only commands go; inside it the text-only ones rank last (they are legal there); an unknown mode keeps all */
export function withModeFilter(options: MacroCompletion[], mode: CompletionMode | null): MacroCompletion[] {
	if (mode === 'text') return options.filter((o) => !o.math);
	if (mode === 'math') return options.map((o) => (o.text ? { ...o, boost: (o.boost ?? 0) + TEXT_ONLY_SINK } : o));
	return options;
}
