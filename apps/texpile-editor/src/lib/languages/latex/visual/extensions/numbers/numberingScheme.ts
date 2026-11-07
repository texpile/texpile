// how a document numbers, from its main file
import { callsIn, rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { blankComments } from '$lib/languages/latex/texCode';
import { documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';
import { definedFormsIn, definesFootnoteIn, mathOpenersIn, mergeOpeners, type MathOpeners } from './definedForms';
import { loadTimeOf } from './loadTimeText';
import { HEADINGS } from './numberedNodes';
import { parseForm } from './numberForms';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { wrappedEnvironmentsIn } from '../environment/environmentHeads';

/** within: what each counter restarts at; forms: see numberForms; secnumdepth: the deepest numbered heading (part -1, chapter 0, section 1) */
export type NumberingScheme = {
	chapters: boolean;
	within: Readonly<Record<string, string>>;
	forms: Readonly<Record<string, string>>;
	/** the forms the class prints after \appendix, where they differ */
	appendixForms: Readonly<Record<string, string>>;
	secnumdepth: number | null;
	mathOpeners: MathOpeners;
	/** footnotes take numbers only the compile knows: revtex's footinbib, or a \footnote of the folder's own */
	uncountedFootnotes: boolean;
	/** each numbered theorem environment and the counter it steps, its own or the one it shares */
	theorems: Readonly<Record<string, string>>;
};

export const PLAIN_NUMBERING: NumberingScheme = {
	chapters: false,
	within: {},
	forms: {},
	appendixForms: {},
	secnumdepth: null,
	mathOpeners: { macros: [], environments: [] },
	uncountedFootnotes: false,
	theorems: {}
};

/** a change to a counter written in the document; value null when it is not a plain number */
export type CounterChange = { counter: string; op: 'set' | 'add'; value: number | null };

// \counterwithin* and the kernel's \@addtoreset restart a counter and leave how it prints
const WITHIN = new Set(['numberwithin', 'counterwithin', '@addtoreset']);

export type WithinChange = { counter: string; parent: string; form?: string };

export type TheoremCounter = { env: string; counter: string; within: string | null };

/** \newtheorem{lemma}[theorem]{Lemma} and \newtheorem{thm}{Theorem}[section]; a starred one numbers nothing */
export function theoremCountersIn(text: string, keep: (at: number) => boolean = () => true): TheoremCounter[] {
	if (!/theorem/.test(text)) return [];
	return callsIn(blankComments(text), ['environment']).flatMap((call) => {
		if (!keep(call.at) || call.args.some((a) => a.arg.kind === 's')) return [];
		const title = call.args.findIndex((a) => rolesOf(a.arg).includes('text'));
		const named = call.args.find((a) => rolesOf(a.arg).includes('environment'));
		const env = named?.values[0]?.value.trim();
		if (title < 0 || !named || !env || !rolesOf(named.arg).includes('counter')) return [];
		// the counter named before the title is the one it shares, after it the one it restarts within
		function counterAt(before: boolean): string | null {
			const arg = call.args.find((a, i) => a !== named && (before ? i < title : i > title) && rolesOf(a.arg).includes('counter'));
			return arg?.values[0]?.value.trim() || null;
		}
		return [{ env, counter: counterAt(true) ?? env, within: counterAt(false) }];
	});
}

/** `keep`: which calls count, by where they start */
export function withinChangesIn(text: string, keep: (at: number) => boolean = () => true): WithinChange[] {
	if (!/within|addtoreset/.test(text)) return [];
	return callsIn(blankComments(text), ['counter']).flatMap((call) => {
		if (!WITHIN.has(call.command) || !keep(call.at)) return [];
		const [counter, parent] = call.args.filter((a) => rolesOf(a.arg).includes('counter')).map((a) => a.values[0]?.value ?? '');
		if (!counter || !parent) return [];
		const resetsOnly = call.command === '@addtoreset' || call.args.some((a) => a.arg.kind === 's');
		return [{ counter, parent, ...(resetsOnly ? {} : { form: `{${parent}}.[arabic]` }) }];
	});
}

// a class whose headings are all unnumbered (revtex's prl) numbers none, as TeX's -\maxdimen does
function deepestNumbered(forms: readonly { name: string; numbered?: boolean }[]): number | null {
	const headings = forms.filter((f) => HEADINGS.includes(f.name));
	const levels = headings.flatMap((f) => (f.numbered !== false ? [HEADINGS.indexOf(f.name) - 1] : []));
	return levels.length ? Math.max(...levels) : headings.length ? -Infinity : null;
}

export function numberingSchemeOf(
	counters: readonly { name: string; within?: string }[],
	forms: readonly { name: string; form: string; numbered?: boolean; appendix?: string }[],
	main: string,
	uncountedFootnotes = false,
	ownFiles: readonly string[] = [],
	/** the files the main file's preamble reads in, which define for the whole document */
	preambleFiles: readonly string[] = []
): NumberingScheme {
	const within: Record<string, string> = {};
	for (const c of counters) if (c.within) within[c.name] = c.within;
	const shown: Record<string, string> = {};
	for (const f of forms) shown[f.name] = f.form;
	// a class form that prints a heading's number restarts with it
	for (const [name, form] of Object.entries(shown)) {
		const ref = parseForm(form)?.find((p) => 'ref' in p);
		if (ref && 'ref' in ref && !within[name]) within[name] = ref.ref;
	}
	const wrapper = documentWrapperOf(main);
	const preamble = wrapper ? main.slice(0, wrapper.begin.from) : main;
	let depth = deepestNumbered(forms);
	const theorems: Record<string, string> = {};
	const sources = [...ownFiles.map(loadTimeOf), ...preambleFiles.map(loadTimeOf), { text: preamble, keep: undefined }];
	for (const { text, keep } of sources) {
		for (const { counter, form } of definedFormsIn(text, keep)) {
			if (form) shown[counter] = form;
			else delete shown[counter];
		}
		for (const { counter, op, value } of counterChangesIn(text, keep))
			if (counter === 'secnumdepth' && value !== null) depth = op === 'set' ? value : depth === null ? null : depth + value;
		for (const { env, counter, within: parent } of theoremCountersIn(text, keep)) {
			theorems[env] = counter;
			if (counter !== env) continue;
			if (parent) within[counter] = parent;
			shown[counter] ??= parent ? `{${parent}}.[arabic]` : '[arabic]';
		}
		for (const change of withinChangesIn(text, keep)) {
			within[change.counter] = change.parent;
			if (change.form) shown[change.counter] = change.form;
		}
		// an environment of the document's own that opens a theorem counts as that theorem
		for (const [env, inner] of wrappedEnvironmentsIn(blankComments(text)))
			if (Object.hasOwn(theorems, inner)) theorems[env] = theorems[inner];
	}
	return {
		chapters: counters.some((c) => c.name === 'chapter'),
		within,
		forms: shown,
		appendixForms: Object.fromEntries(forms.flatMap((f) => (f.appendix ? [[f.name, f.appendix]] : []))),
		secnumdepth: depth,
		mathOpeners: mergeOpeners([preamble, ...preambleFiles].map(mathOpenersIn)),
		uncountedFootnotes: uncountedFootnotes || [preamble, ...preambleFiles].some(definesFootnoteIn),
		theorems
	};
}

/** the class offers footinbib and the document does not ask for nofootinbib */
export function footnotesInBibliographyOf(loaded: readonly LoadedFile[]): boolean {
	const cls = loaded.find((f) => f.name.startsWith('class-'));
	if (!cls) return false;
	const offered = cls.layers.flatMap((layer) =>
		Object.entries(layer.keys ?? {})
			.filter(([at]) => at.endsWith('#options'))
			.flatMap(([, keys]) => keys.map((k) => k.key))
	);
	return offered.includes('footinbib') && !cls.options.has('nofootinbib');
}

export function counterChangesIn(text: string, keep: (at: number) => boolean = () => true): CounterChange[] {
	if (!/counter/.test(text)) return [];
	const out: CounterChange[] = [];
	for (const call of callsIn(blankComments(text), ['counter'])) {
		if (!keep(call.at)) continue;
		const [counter, amount] = call.args.map((a) => a.values[0]?.value.trim() ?? '');
		const literal = /^-?\d+$/.test(amount ?? '') ? Number(amount) : null;
		if (call.command === 'setcounter') out.push({ counter, op: 'set', value: literal });
		else if (call.command === 'addtocounter') out.push({ counter, op: 'add', value: literal });
		else if (call.command === 'stepcounter' || call.command === 'refstepcounter') out.push({ counter, op: 'add', value: 1 });
	}
	return out;
}
