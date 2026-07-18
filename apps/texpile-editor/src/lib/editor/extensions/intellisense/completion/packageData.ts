// lazy loader + keyval lookup over the vendored LaTeX Workshop package JSONs (data/packages/*).
// resolution is by macro/env NAME across all packages (data/packages/index.ts), preferring ones
// the buffer actually \usepackage's — zero-config like the rest of our completion, where LW only
// offers keyvals after the package is detected in the include tree.
import { snippetCompletion, type Completion } from '@codemirror/autocomplete';
import { PKG_OF_MACRO, PKG_OF_ENV } from '../data/packages/index';

interface PkgArg {
	format: string;
	snippet: string;
	keys?: string[];
	keyPos?: number;
}
interface PkgEntry {
	name: string;
	arg?: PkgArg;
	unusual?: boolean;
	detail?: string;
	doc?: string;
}
export interface PackageData {
	deps?: Array<{ name: string; if?: string }>;
	macros: PkgEntry[];
	envs: PkgEntry[];
	keys: Record<string, string[]>;
	args?: string[];
}

const modules = import.meta.glob<{ default: PackageData }>('../data/packages/*.json');
const cache = new Map<string, Promise<PackageData | null>>();

export function loadPackage(name: string): Promise<PackageData | null> {
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
function toCmSnippet(body: string): string {
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

function orderByDetected(pkgs: string[], detected: Set<string>): string[] {
	return [...pkgs].sort((a, b) => Number(detected.has(b)) - Number(detected.has(a)));
}

// the open bracket being typed must agree with the macro's declared shape at that position, so
// \href{url} never gets [..]-style keys offered inside its url/text groups
function formatMatches(format: string, argIndex: number, open: '[' | '{'): boolean {
	const groups = format.match(/\[\]|\{\}/g) ?? [];
	return groups[argIndex] === (open === '[' ? '[]' : '{}');
}

/** keyval completions for \name's argIndex-th bracket group (0-based, counting all groups). */
export async function keysForMacro(name: string, argIndex: number, open: '[' | '{', detected: Set<string>): Promise<Completion[] | null> {
	const pkgs = PKG_OF_MACRO[name];
	if (!pkgs) return null;
	for (const pkg of orderByDetected(pkgs, detected)) {
		const data = await loadPackage(pkg);
		if (!data) continue;
		for (const m of data.macros) {
			if (m.name !== name || !m.arg?.keys?.length) continue;
			if ((m.arg.keyPos ?? 0) !== argIndex || !formatMatches(m.arg.format, argIndex, open)) continue;
			const keys = m.arg.keys.flatMap((g) => data.keys[g] ?? []);
			if (keys.length) return dedupe(keys);
		}
		// a key group named after the macro binds its leading [options] even without a macro entry
		// (graphicx ships includegraphics* key-less but has the "\includegraphics" group)
		if (argIndex === 0 && open === '[') {
			const group = data.keys['\\' + name] ?? data.keys['\\' + name + '*'];
			if (group?.length) return dedupe(group);
		}
	}
	return null;
}

/** keyval completions for \begin{env}'s bracket groups; argIndex counts {env} as group 0. */
export async function keysForEnv(env: string, argIndex: number, open: '[' | '{', detected: Set<string>): Promise<Completion[] | null> {
	const pkgs = PKG_OF_ENV[env];
	if (!pkgs) return null;
	for (const pkg of orderByDetected(pkgs, detected)) {
		const data = await loadPackage(pkg);
		if (!data) continue;
		for (const e of data.envs) {
			if (e.name !== env || !e.arg?.keys?.length) continue;
			if ((e.arg.keyPos ?? 0) + 1 !== argIndex || !formatMatches(e.arg.format, argIndex - 1, open)) continue;
			const keys = e.arg.keys.flatMap((g) => data.keys[g] ?? []);
			if (keys.length) return dedupe(keys);
		}
	}
	return null;
}

/** \usepackage[...]/\documentclass[...] option lists, merged across the named packages. */
export async function packageOptions(names: string[]): Promise<Completion[] | null> {
	const keys: string[] = [];
	for (const name of names) {
		const data = await loadPackage(name);
		if (!data?.args?.length) continue;
		for (const g of data.args) keys.push(...(data.keys[g] ?? []));
	}
	return keys.length ? dedupe(keys) : null;
}

const USEPKG_DECL = /\\(?:usepackage|RequirePackage(?:WithOptions)?)\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g;
let detectCache: { text: string; packages: Set<string> } | null = null;

/** package names \usepackage'd anywhere in the buffer (used to prefer their data on conflicts). */
export function detectedPackages(text: string): Set<string> {
	if (detectCache?.text === text) return detectCache.packages;
	const packages = new Set<string>();
	USEPKG_DECL.lastIndex = 0;
	for (let m = USEPKG_DECL.exec(text); m; m = USEPKG_DECL.exec(text)) {
		for (const name of m[1].split(',')) {
			const trimmed = name.trim();
			if (trimmed) packages.add(trimmed);
		}
	}
	detectCache = { text, packages };
	return packages;
}
