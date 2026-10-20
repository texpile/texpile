// argument/keyval completion, resolved through the package data (knowledge/keyCompletions.ts:
// \usepackage options, \documentclass options, macro/env keyvals and values)
import { snippetCompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { lastListToken } from './shared';
import { keysForEnv, keysForMacro, packageOptions } from '../../knowledge/keyCompletions';
import { DEFAULT_CLASS, documentPackages } from '../packages/loadedPackages';
import { loaderOpening, loadersOf, prefixOf, type Loader } from '../packages/loaderCommands';

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

// LW's argument trigger: macro name + its completed argument groups + the open group being typed
const KEYVAL_BEFORE = /\\([a-zA-Z]+)\*?((?:\[[^[\]{}]*\]|\{[^[\]{}]*\})*)([[{])[^[\]{}]*$/;

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
			return packageOptions(classes).then((options) => (options ? lastListToken(opening, options, { lenient: true }) : null));
		}
		if (!list.length) return null;
		return packageOptions(list).then((options) => (options?.length ? lastListToken(opening, options, { lenient: true }) : null));
	}

	const keyval = ctx.matchBefore(KEYVAL_BEFORE);
	if (keyval) {
		const m = KEYVAL_BEFORE.exec(keyval.text);
		if (!m) return null;
		const [, name, groups, open] = m;
		const typed = [...(groups.match(/\[[^\]]*\]|\{[^}]*\}/g) ?? []), open].map((g) => (g[0] === '[' ? '[]' : '{}'));
		return documentPackages(ctx.state.doc.toString())
			.then((loaded) =>
				name === 'begin' ? keysForEnv(/^\{([^{}]*)\}/.exec(groups)?.[1] ?? '', typed.slice(1), loaded) : keysForMacro(name, typed, loaded)
			)
			.then((options) => (options ? lastListToken(keyval, options, { lenient: true }) : null));
	}
	return null;
}
