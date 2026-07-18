// argument/keyval completion. package-dependent slots resolve through the vendored LW package
// data (packageData.ts: \usepackage options, \documentclass options incl class-specific sets,
// macro/env keyvals with keyPos); the few hand rules left below cover kernel values LW's data
// doesn't carry (pagestyle/pagenumbering, fontenc encodings, colors, bib styles).
import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { ARG_KEY_RULES } from '../data/argKeys';
import { FONT_ENCODINGS } from '../data/encodings';
import { COLOR_NAMES } from '../data/colornames';
import { BIB_STYLES } from '../data/bibstyles';
import { lastListToken } from './shared';
import { detectedPackages, keysForEnv, keysForMacro, packageOptions } from './packageData';

const COLOR_TRIGGERS: RegExp[] = [
	/\\(?:textcolor|color|pagecolor|normalcolor)\*?\{[^{}]*$/,
	/\\colorbox\*?\{[^{}]*$/,
	/\\fcolorbox\*?\{[^{}]*\}\{[^{}]*$/,
	/\\fcolorbox\*?\{[^{}]*$/
];

const BIBSTYLE_TRIGGER = /\\(?:bibliographystyle|citestyle)\{[^{}]*$/;
const USEPACKAGE_OPTIONS_TRIGGER = /\\(?:usepackage|RequirePackage(?:WithOptions)?)\[[^\]]*$/;
const DOCUMENTCLASS_OPTIONS_TRIGGER = /\\documentclass\[[^\]]*$/;
// the TRAILING optional arg (\usepackage{pkg}[...]) is a minimum release date, not options
const RELEASE_DATE_TRIGGER = /\\(?:usepackage|RequirePackage(?:WithOptions)?|documentclass)(?:\[[^\]{}]*\])?\{[^{}]*\}\[[^\]]*$/;
// the package/class name may be typed AFTER the cursor (options come first), so it's read from
// the whole line rather than folded into the trigger regex. the ] is optional: mid-typing a
// bracket in front of an existing {name} ("\usepackage[{graphicx}") must still resolve
const USEPACKAGE_NAME_ON_LINE = /\\(?:usepackage|RequirePackage(?:WithOptions)?)(?:\[[^\]{}]*\]?)?\{([^{}]+)\}/;
const DOCUMENTCLASS_NAME_ON_LINE = /\\documentclass(?:\[[^\]{}]*\]?)?\{([^{}]+)\}/;

// LW's argument trigger: macro name + its completed argument groups + the open group being typed
const KEYVAL_BEFORE = /\\([a-zA-Z]+)\*?((?:\[[^[\]{}]*\]|\{[^[\]{}]*\})*)([[{])[^[\]{}]*$/;

const DEFAULT_CLASSES = new Set(['article', 'report', 'book']);

function toCompletion(value: string): Completion {
	return { label: value, type: 'constant' };
}

function countArgGroups(groups: string): number {
	return groups.match(/\[[^\]]*\]|\{[^}]*\}/g)?.length ?? 0;
}

export function argumentCompletionSource(ctx: CompletionContext): CompletionResult | Promise<CompletionResult | null> | null {
	// kernel-value rules LW's package data doesn't carry
	for (const rule of ARG_KEY_RULES) {
		const match = ctx.matchBefore(rule.trigger);
		if (match) return lastListToken(match, rule.options.map(toCompletion), { lenient: true });
	}
	for (const trigger of COLOR_TRIGGERS) {
		const match = ctx.matchBefore(trigger);
		if (match) return lastListToken(match, COLOR_NAMES.map(toCompletion), { lenient: true });
	}
	const bibstyle = ctx.matchBefore(BIBSTYLE_TRIGGER);
	if (bibstyle) return lastListToken(bibstyle, BIB_STYLES.map(toCompletion), { lenient: true });

	// checked before the options triggers: options only belong in the LEADING bracket, and this
	// slot silently swallows them (LaTeX parses whatever is here as a version date)
	const releaseDate = ctx.matchBefore(RELEASE_DATE_TRIGGER);
	if (releaseDate) {
		return lastListToken(
			releaseDate,
			[snippetCompletion('${1:2024}/${2:01}/${3:01}', { label: '2024/01/01', detail: 'minimum release date', type: 'constant' })],
			{ lenient: true }
		);
	}

	const line = ctx.state.doc.lineAt(ctx.pos).text;

	const usepackage = ctx.matchBefore(USEPACKAGE_OPTIONS_TRIGGER);
	if (usepackage) {
		const names = USEPACKAGE_NAME_ON_LINE.exec(line)?.[1];
		if (!names) return null;
		const list = names
			.split(',')
			.map((n) => n.trim())
			.filter(Boolean);
		return packageOptions(list).then((options) => {
			if (list.includes('fontenc')) options = [...FONT_ENCODINGS.map(toCompletion), ...(options ?? [])];
			return options?.length ? lastListToken(usepackage, options, { lenient: true }) : null;
		});
	}

	const documentclass = ctx.matchBefore(DOCUMENTCLASS_OPTIONS_TRIGGER);
	if (documentclass) {
		const cls = DOCUMENTCLASS_NAME_ON_LINE.exec(line)?.[1]?.trim();
		// class-specific option set when LW ships one, the standard-class set otherwise
		const sources = cls && !DEFAULT_CLASSES.has(cls) ? [`class-${cls}`, 'latex-document'] : ['latex-document'];
		return packageOptions(sources).then((options) => (options ? lastListToken(documentclass, options, { lenient: true }) : null));
	}

	const keyval = ctx.matchBefore(KEYVAL_BEFORE);
	if (keyval) {
		const m = KEYVAL_BEFORE.exec(keyval.text);
		if (!m) return null;
		const [, name, groups, open] = m;
		const bracket = open as '[' | '{';
		const argIndex = countArgGroups(groups);
		const detected = detectedPackages(ctx.state.doc.toString());
		const lookup =
			name === 'begin'
				? keysForEnv(/^\{([^{}]*)\}/.exec(groups)?.[1] ?? '', argIndex, bracket, detected)
				: keysForMacro(name, argIndex, bracket, detected);
		return lookup.then((options) => (options ? lastListToken(keyval, options, { lenient: true }) : null));
	}
	return null;
}
