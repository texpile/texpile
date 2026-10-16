// lazy loader + keyval lookup over the bundled package JSONs (data/packages/*, LaTeX Workshop's format).
// resolution is by macro/env NAME across all packages (data/packages/index.ts), preferring ones
// the buffer actually \usepackage's — zero-config like the rest of our completion, where LW only
// offers keyvals after the package is detected in the include tree.
import { snippetCompletion, type Completion } from '@codemirror/autocomplete';
import { PKG_OF_MACRO, PKG_OF_ENV } from '../data/packages/index';
import { mergePackages, userPackage, userPackageNames } from '../userPackages';
import type { Engine } from '$lib/workspace/compileCommand';

type PkgArg = {
	format: string;
	snippet: string;
	keys?: string[];
	keyPos?: number;
};
export type PkgEntry = {
	name: string;
	arg?: PkgArg;
	unusual?: boolean;
	detail?: string;
	doc?: string;
	/** the package option or language it exists under */
	if?: string;
	math?: boolean;
};
export type PackageData = {
	deps?: Array<{ name: string; if?: string; engines?: Engine[] }>;
	macros: PkgEntry[];
	envs: PkgEntry[];
	keys: Record<string, string[]>;
	args?: string[];
};

const modules = import.meta.glob<{ default: PackageData }>('../data/packages/*.json');
const cache = new Map<string, Promise<PackageData | null>>();

export function isBundledPackage(name: string): boolean {
	return `../data/packages/${name}.json` in modules;
}

/** every bundled package file's name: packages, class-<name> and the libraries */
export function bundledPackageNames(): string[] {
	return Object.keys(modules).map((path) => path.slice('../data/packages/'.length, -'.json'.length));
}

/** bundled data with the user's own package file on top */
export async function loadPackage(name: string): Promise<PackageData | null> {
	return mergePackages(await loadBundled(name), userPackage(name));
}

function loadBundled(name: string): Promise<PackageData | null> {
	let entry = cache.get(name);
	if (!entry) {
		const loader = modules[`../data/packages/${name}.json`];
		entry = loader
			? loader()
					.then((m) => m.default)
					.catch(() => null)
			: Promise.resolve(null);
		cache.set(name, entry);
	}
	return entry;
}

// VS Code snippet syntax -> CodeMirror: choice lists keep their first choice, hint markers drop
export function toCmSnippet(body: string): string {
	return body
		.replace(/\$\{(\d+)\|([^|}]*)\|\}/g, (_, n: string, choices: string) => `\${${n}:${choices.split(',')[0]}}`)
		.replace(/%(?:keyvals|plain)\b/g, '')
		.replace(/\$(\d+)/g, '${$1}');
}

function keyOption(raw: string): Completion {
	const clean = raw.replace(/%(?:keyvals|plain)\b/g, '');
	if (!clean.includes('$')) return { label: clean, type: 'property' };
	const label = clean.replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '').replace(/\$\d+/g, '');
	return snippetCompletion(toCmSnippet(clean), { label: label || clean.split('$')[0], type: 'property' });
}

function dedupe(keys: string[]): Completion[] {
	return [...new Set(keys)].map(keyOption);
}

function withUserPackages(bundled: string[] | undefined, defines: (pkg: PackageData) => boolean): string[] {
	const own = userPackageNames().filter((n) => defines(userPackage(n)!));
	return [...new Set([...(bundled ?? []), ...own])];
}

function orderByDetected(pkgs: string[], detected: Set<string>): string[] {
	return [...pkgs].sort((a, b) => Number(detected.has(b)) - Number(detected.has(a)));
}

/** a bracket group as the format writes it: `[]`, `{}`, `()` or `<>` */
export type ArgGroup = string;

// read the way LaTeX reads arguments: a group the writer left out is skipped when it is optional, so
// \newtcolorbox{name}[1]{ reaches the options of [init]{name}[n][default]{options}; -1 when the typed groups do not fit
function typedGroupPosition(format: string, typed: ArgGroup[]): number {
	const groups = format.match(/\[\]|\{\}|\(\)|<>/g) ?? [];
	let at = -1;
	for (const t of typed) {
		at++;
		while (at < groups.length && groups[at] !== t && groups[at] !== '{}') at++;
		if (groups[at] !== t) return -1;
	}
	return at;
}

/** keyval completions for the last of the groups typed after \name, the one being typed. */
export async function keysForMacro(name: string, typed: ArgGroup[], detected: Set<string>): Promise<Completion[] | null> {
	const pkgs = withUserPackages(PKG_OF_MACRO[name], (d) => d.macros.some((m) => m.name === name));
	if (!pkgs.length) return null;
	for (const pkg of orderByDetected(pkgs, detected)) {
		const pkgData = await loadPackage(pkg);
		if (!pkgData) continue;
		for (const m of pkgData.macros) {
			if (m.name !== name || !m.arg?.keys?.length) continue;
			if (typedGroupPosition(m.arg.format, typed) !== (m.arg.keyPos ?? 0)) continue;
			const keys = m.arg.keys.flatMap((g) => pkgData.keys[g] ?? []);
			if (keys.length) return dedupe(keys);
		}
		// a key group named after the macro binds its leading [options] even without a macro entry
		// (graphicx ships includegraphics* key-less but has the "\includegraphics" group)
		if (typed.length === 1 && typed[0] === '[]') {
			const group = pkgData.keys['\\' + name] ?? pkgData.keys['\\' + name + '*'];
			if (group?.length) return dedupe(group);
		}
	}
	return null;
}

/** keyval completions for the last of the groups typed after \begin{env}, the one being typed. */
export async function keysForEnv(env: string, typed: ArgGroup[], detected: Set<string>): Promise<Completion[] | null> {
	const pkgs = withUserPackages(PKG_OF_ENV[env], (d) => d.envs.some((e) => e.name === env));
	if (!pkgs.length) return null;
	for (const pkg of orderByDetected(pkgs, detected)) {
		const pkgData = await loadPackage(pkg);
		if (!pkgData) continue;
		for (const e of pkgData.envs) {
			if (e.name !== env || !e.arg?.keys?.length) continue;
			if (typedGroupPosition(e.arg.format, typed) !== (e.arg.keyPos ?? 0)) continue;
			const keys = e.arg.keys.flatMap((g) => pkgData.keys[g] ?? []);
			if (keys.length) return dedupe(keys);
		}
	}
	return null;
}

/** \usepackage[...]/\documentclass[...] option lists, merged across the named packages. */
export async function packageOptions(names: string[]): Promise<Completion[] | null> {
	const keys: string[] = [];
	for (const name of names) {
		const pkgData = await loadPackage(name);
		if (!pkgData?.args?.length) continue;
		for (const g of pkgData.args) keys.push(...(pkgData.keys[g] ?? []));
	}
	return keys.length ? dedupe(keys) : null;
}
