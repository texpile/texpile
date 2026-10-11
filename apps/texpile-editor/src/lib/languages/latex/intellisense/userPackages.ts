// package files people write, in LaTeX Workshop's package JSON: .texpile/packages/<name>.json and
// the global folder's. they add to (or stand in for) the contents Texpile ships for a package
import { stripJsonc } from '$lib/editor/snippets/file/parseSnippetFile';
import type { PackageData, PkgEntry } from './completion/packageData';

const packages = new Map<string, PackageData>();

export function userPackage(name: string): PackageData | null {
	return packages.get(name) ?? null;
}

export function userPackageNames(): string[] {
	return [...packages.keys()];
}

export function setUserPackages(next: Map<string, PackageData>): void {
	packages.clear();
	for (const [name, contents] of next) packages.set(name, contents);
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function entryOf(raw: unknown): PkgEntry | null {
	if (!isObject(raw) || typeof raw.name !== 'string' || !raw.name) return null;
	const entry: PkgEntry = { name: raw.name };
	const arg = raw.arg;
	if (arg !== undefined) {
		if (!isObject(arg) || typeof arg.format !== 'string' || typeof arg.snippet !== 'string') return null;
		entry.arg = { format: arg.format, snippet: arg.snippet };
		if (Array.isArray(arg.keys) && arg.keys.every((k) => typeof k === 'string')) entry.arg.keys = arg.keys as string[];
		if (typeof arg.keyPos === 'number') entry.arg.keyPos = arg.keyPos;
	}
	if (typeof raw.detail === 'string') entry.detail = raw.detail;
	if (typeof raw.doc === 'string') entry.doc = raw.doc;
	if (raw.unusual === true) entry.unusual = true;
	return entry;
}

/** a package file's contents, with the entries that are not the right shape counted out */
export function parsePackageFile(text: string): { contents: PackageData | null; problem: string | null } {
	let raw: unknown;
	try {
		raw = JSON.parse(stripJsonc(text));
	} catch (e) {
		return { contents: null, problem: `is not valid JSON: ${(e as Error).message}` };
	}
	if (!isObject(raw)) return { contents: null, problem: 'is not a JSON object' };
	let dropped = 0;
	function list(v: unknown): PkgEntry[] {
		return (Array.isArray(v) ? v : []).flatMap((item) => {
			const entry = entryOf(item);
			if (!entry) dropped++;
			return entry ? [entry] : [];
		});
	}
	const keys: Record<string, string[]> = {};
	if (isObject(raw.keys))
		for (const [group, values] of Object.entries(raw.keys)) {
			if (Array.isArray(values) && values.every((k) => typeof k === 'string')) keys[group] = values as string[];
			else dropped++;
		}
	const contents: PackageData = { macros: list(raw.macros), envs: list(raw.envs), keys };
	if (Array.isArray(raw.args) && raw.args.every((a) => typeof a === 'string')) contents.args = raw.args as string[];
	return { contents, problem: dropped ? `has ${dropped} entries that are not the right shape` : null };
}

/** `over`'s entries in place of `base`'s of the same name */
export function mergePackages(base: PackageData | null, over: PackageData | null): PackageData | null {
	if (!base || !over) return over ?? base;
	function merge(a: PkgEntry[], b: PkgEntry[]): PkgEntry[] {
		return [...b, ...a.filter((e) => !b.some((o) => o.name === e.name))];
	}
	return {
		...base,
		macros: merge(base.macros, over.macros),
		envs: merge(base.envs, over.envs),
		keys: { ...base.keys, ...over.keys },
		args: over.args ?? base.args
	};
}

/** an argument format such as `[]{}` as the parser's signature `o m`; null past a group it cannot read */
export function signatureOfFormat(format: string): string | null {
	const groups = format.match(/\[\]|\{\}|\(\)|<>/g) ?? [];
	if (groups.join('') !== format.replace(/\s/g, '') || groups.some((g) => g === '()' || g === '<>')) return null;
	return groups.map((g) => (g === '[]' ? 'o' : 'm')).join(' ');
}
