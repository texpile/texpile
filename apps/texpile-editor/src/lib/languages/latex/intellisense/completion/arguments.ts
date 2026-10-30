// argument/keyval completion, resolved through the package data (knowledge/keyCompletions.ts:
// \usepackage options, \documentclass options, macro/env keyvals and values)
import { snippetCompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import { lastListToken } from './shared';
import { keyListCompletions } from './keys/keyListCompletions';
import { OPERATION_BEFORE, pathKeys } from './keys/pathOperations';
import { forestKeys, forestOptionsStart } from './keys/forestNodes';
import { keysForEnv, keysForMacro, packageOptions } from '../../knowledge/keyCompletions';
import { docText } from '$lib/editor/source/docText';
import { argumentAt, callAt, type OpenArgument } from '../../knowledge/calls/commandCalls';
import { keyListFromTree } from '../../syntax/treeKeyList';
import { latexTreeAt } from './mathContext';
import { DEFAULT_CLASS, documentPackages } from '../packages/loadedPackages';
import { loadersOf, prefixOf, type Loader } from '../packages/loaderCommands';

const STATEMENT_LOOK_BACK = 2000;
const OPTION_LOADERS = loadersOf(['package', 'class']).filter((l) => l.hasOptions);
// the names follow the options, so they may sit after the cursor
const NAMES_LOOK_AHEAD = 2000;

function loaderNames(state: EditorState, at: number, loader: Loader): string[] {
	const text = state.sliceDoc(at, at + NAMES_LOOK_AHEAD);
	const names = callAt(text, 0)?.args.find((a) => a.arg === loader.arg);
	return names?.values.map((v) => v.value) ?? [];
}

// the open bracket and what is typed after it
function bracketOf(ctx: CompletionContext, behind: string, open: OpenArgument): { from: number; text: string } {
	const from = ctx.pos - behind.length + open.arg.from - 1;
	return { from, text: ctx.state.sliceDoc(from, ctx.pos) };
}

export function argumentCompletionSource(ctx: CompletionContext): CompletionResult | Promise<CompletionResult | null> | null {
	const behind = ctx.state.sliceDoc(Math.max(0, ctx.pos - STATEMENT_LOOK_BACK), ctx.pos);
	// checked before the options: options only belong in the LEADING bracket, and this
	// slot silently swallows them (LaTeX parses whatever is here as a version date)
	const releaseDate = argumentAt(behind, ['date']);
	if (releaseDate) {
		return lastListToken(
			bracketOf(ctx, behind, releaseDate),
			[snippetCompletion('${1:YYYY}/${2:MM}/${3:DD}', { label: 'YYYY/MM/DD', detail: 'minimum release date', type: 'constant' })],
			{ lenient: true }
		);
	}

	const opening = argumentAt(behind, ['options']);
	const loader = opening?.arg.index === 0 ? OPTION_LOADERS.find((l) => l.command === opening.call.command) : undefined;
	if (opening && loader) {
		const list = loaderNames(ctx.state, ctx.pos - behind.length + opening.call.at, loader);
		const typing = bracketOf(ctx, behind, opening);
		if (loader.role === 'class') {
			const classes = list.length ? list.map((n) => prefixOf(loader.arg) + n) : [DEFAULT_CLASS];
			return packageOptions(classes).then((options) => options && keyListCompletions(typing, options, ctx.state.doc));
		}
		if (!list.length) return null;
		return packageOptions(list).then((options) => options && keyListCompletions(typing, options, ctx.state.doc));
	}

	const forestAt = forestOptionsStart(ctx.state, ctx.pos);
	if (forestAt >= 0) {
		const node = { from: forestAt, text: ctx.state.sliceDoc(forestAt, ctx.pos) };
		return documentPackages(docText(ctx.state.doc))
			.then(forestKeys)
			.then((keyed) => keyed && keyListCompletions(node, keyed, ctx.state.doc));
	}

	const tree = latexTreeAt(ctx.state, ctx.pos);
	const list = tree && keyListFromTree(tree, docText(ctx.state.doc), ctx.pos);
	if (list) {
		const typed = [...list.typed, list.opener === '[' ? '[]' : '{}'];
		const typing = { from: list.from, text: ctx.state.sliceDoc(list.from, ctx.pos) };
		return documentPackages(docText(ctx.state.doc))
			.then((loaded) =>
				list.environment === undefined ? keysForMacro(list.command, typed, loaded) : keysForEnv(list.environment, typed, loaded)
			)
			.then((keyed) => keyed && keyListCompletions(typing, keyed, ctx.state.doc));
	}

	const operation = ctx.matchBefore(OPERATION_BEFORE);
	if (operation) {
		const before = ctx.state.sliceDoc(Math.max(0, operation.from - STATEMENT_LOOK_BACK), operation.from);
		return documentPackages(docText(ctx.state.doc))
			.then((loaded) => pathKeys(before, loaded))
			.then((keyed) => keyed && keyListCompletions(operation, keyed, ctx.state.doc));
	}
	return null;
}
