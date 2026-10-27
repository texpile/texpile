// argument/keyval completion, resolved through the package data (knowledge/keyCompletions.ts:
// \usepackage options, \documentclass options, macro/env keyvals and values)
import { snippetCompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { lastListToken } from './shared';
import { keyListCompletions } from './keys/keyListCompletions';
import { OPERATION_BEFORE, pathKeys } from './keys/pathOperations';
import { forestKeys, forestOptionsStart } from './keys/forestNodes';
import { keysForEnv, keysForMacro, packageOptions } from '../../knowledge/keyCompletions';
import { docText } from '$lib/editor/source/docText';
import { keyListFromTree } from '../../source/tree/treeKeyList';
import { latexTreeAt } from './mathContext';
import { DEFAULT_CLASS, documentPackages } from '../packages/loadedPackages';
import { loaderOpening, loadersOf, prefixOf, type Loader } from '../packages/loaderCommands';

const STATEMENT_LOOK_BACK = 2000;
const OPTION_LOADERS = loadersOf(['package', 'class']).filter((l) => l.hasOptions);
const OPTIONS_TRIGGER = new RegExp(`\\\\(${OPTION_LOADERS.map((l) => l.command).join('|')})\\[[^\\]]*$`);
// the trailing optional argument (\usepackage{pkg}[...]) is a minimum release date, not options
const RELEASE_DATE_TRIGGER = new RegExp(
	`(?:${loadersOf(['package', 'class'])
		.filter((l) => l.hasDate)
		.map((l) => `${loaderOpening(l)}\\{[^{}]*\\}`)
		.join('|')})\\[[^\\]]*$`
);

// the name may be typed AFTER the cursor (options come first), so it is read from the whole line.
// the ] is optional: mid-typing a bracket in front of an existing {name} must still resolve
function namesOnLine(line: string, loader: Loader): string[] {
	const names = new RegExp(`${loaderOpening(loader, true)}\\{([^{}]+)\\}`).exec(line)?.[1] ?? '';
	return (loader.arg.list ? names.split(',') : [names]).map((n) => n.trim()).filter(Boolean);
}

export function argumentCompletionSource(ctx: CompletionContext): CompletionResult | Promise<CompletionResult | null> | null {
	// checked before the options triggers: options only belong in the LEADING bracket, and this
	// slot silently swallows them (LaTeX parses whatever is here as a version date)
	const releaseDate = ctx.matchBefore(RELEASE_DATE_TRIGGER);
	if (releaseDate) {
		return lastListToken(
			releaseDate,
			[snippetCompletion('${1:YYYY}/${2:MM}/${3:DD}', { label: 'YYYY/MM/DD', detail: 'minimum release date', type: 'constant' })],
			{ lenient: true }
		);
	}

	const line = ctx.state.doc.lineAt(ctx.pos).text;

	const opening = ctx.matchBefore(OPTIONS_TRIGGER);
	if (opening) {
		const loader = OPTION_LOADERS.find((l) => l.command === OPTIONS_TRIGGER.exec(opening.text)?.[1])!;
		const list = namesOnLine(line, loader);
		if (loader.role === 'class') {
			const classes = list.length ? list.map((n) => prefixOf(loader.arg) + n) : [DEFAULT_CLASS];
			return packageOptions(classes).then((options) => options && keyListCompletions(opening, options, ctx.state.doc));
		}
		if (!list.length) return null;
		return packageOptions(list).then((options) => options && keyListCompletions(opening, options, ctx.state.doc));
	}

	const behind = ctx.state.sliceDoc(Math.max(0, ctx.pos - STATEMENT_LOOK_BACK), ctx.pos);
	const forestAt = forestOptionsStart(behind);
	if (forestAt >= 0) {
		const node = { from: ctx.pos - behind.length + forestAt, text: behind.slice(forestAt) };
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
