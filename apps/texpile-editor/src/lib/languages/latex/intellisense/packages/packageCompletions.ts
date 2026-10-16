/* eslint id-denylist: "off" -- "info" here is @codemirror/autocomplete's Completion field */
// one completion per command or environment the loaded packages define
import { snippetCompletion, type Completion } from '@codemirror/autocomplete';
import { needsAutoChain, withAutoChain } from '../completion/shared';
import { toCmSnippet, type PackageData, type PkgEntry } from './packageData';
import { entriesUnder, KERNEL_PACKAGE, type LoadedPackage } from './loadedPackages';

/** math: ranked first inside math */
export type MacroCompletion = Completion & { math?: boolean };
export type EnvironmentName = { name: string; detail?: string };

const OPTIONAL_GROUP = /\[\]|\(\)|<>/g;

function optionalGroups(e: PkgEntry): number {
	return e.arg?.format.match(OPTIONAL_GROUP)?.length ?? 0;
}

function formatLength(e: PkgEntry): number {
	return e.arg?.format.length ?? 0;
}

// placeholder words stay out: the field is selected on insert, so the next completion would filter by them
function fieldsOf(snippet: string): string {
	return toCmSnippet(snippet).replace(/\$\{(\d+):[^{}]*\}/g, '${$1}');
}

// inserts the form without optional arguments and shows the fullest one
function macroOf(name: string, forms: PkgEntry[]): MacroCompletion {
	const insert = forms.reduce((a, b) => (optionalGroups(b) < optionalGroups(a) ? b : a));
	const fullest = forms.reduce((a, b) => (formatLength(b) > formatLength(a) ? b : a));
	const detail = forms.find((e) => e.detail)?.detail ?? (fullest.arg?.format || undefined);
	const info = forms.find((e) => e.doc)?.doc;
	const label = '\\' + name;
	const base: Completion = insert.arg?.snippet
		? snippetCompletion('\\' + fieldsOf(insert.arg.snippet), { label, type: 'function', detail, info })
		: { label, type: 'function', detail, info };
	const option: MacroCompletion = insert.arg?.snippet?.includes('$') || needsAutoChain(name) ? withAutoChain(base) : base;
	if (forms.some((e) => e.math)) option.math = true;
	return option;
}

function byName(entries: PkgEntry[]): Map<string, PkgEntry[]> {
	const out = new Map<string, PkgEntry[]>();
	for (const e of entries) if (!e.unusual) out.set(e.name, [...(out.get(e.name) ?? []), e]);
	return out;
}

const built = new WeakMap<PackageData, Map<string, { macros: MacroCompletion[]; envs: EnvironmentName[] }>>();

/** what one package defines itself */
export function ownCompletions(pkg: LoadedPackage): { macros: MacroCompletion[]; envs: EnvironmentName[] } {
	const key = [...pkg.options].sort().join(',');
	const forPackage = built.get(pkg.contents) ?? new Map();
	built.set(pkg.contents, forPackage);
	let out = forPackage.get(key);
	if (!out) {
		const macros = [...byName(entriesUnder(pkg.contents.macros, pkg.options))].map(([name, forms]) => macroOf(name, forms));
		const envs = [...byName(entriesUnder(pkg.contents.envs, pkg.options))].map(([name, forms]) => ({
			name,
			detail: forms.reduce((a, b) => (formatLength(b) > formatLength(a) ? b : a)).arg?.format || undefined
		}));
		out = { macros, envs };
		forPackage.set(key, out);
	}
	return out;
}

export type PackageCompletions = { macros: MacroCompletion[]; envs: EnvironmentName[]; labels: Set<string>; envNames: Set<string> };

// plain TeX's, which amsmath turns into environments; \footnote stays a command beside footnote.sty's environment
const PLAIN_TEX_FORMS = new Set(['matrix', 'pmatrix', 'cases']);

const merged = new WeakMap<LoadedPackage[], PackageCompletions>();

/** what the packages define, a later package's definition winning a shared name */
export function packageCompletions(loaded: LoadedPackage[]): PackageCompletions {
	let out = merged.get(loaded);
	if (!out) {
		const macros = new Map<string, MacroCompletion>();
		const envs = new Map<string, EnvironmentName>();
		const fromKernel = new Set<string>();
		for (const pkg of loaded) {
			const own = ownCompletions(pkg);
			for (const m of own.macros) {
				macros.set(m.label, m);
				if (pkg.name === KERNEL_PACKAGE) fromKernel.add(m.label);
				else fromKernel.delete(m.label);
			}
			for (const e of own.envs) {
				envs.set(e.name, e);
				if (pkg.name !== KERNEL_PACKAGE && PLAIN_TEX_FORMS.has(e.name) && fromKernel.has('\\' + e.name)) macros.delete('\\' + e.name);
			}
		}
		out = { macros: [...macros.values()], envs: [...envs.values()], labels: new Set(macros.keys()), envNames: new Set(envs.keys()) };
		merged.set(loaded, out);
	}
	return out;
}
