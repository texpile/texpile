// the reader's own package files: .texpile/packages/<name>.json and the global folder's, named like the package
import { notJson, notObject, stripJsonc } from '$lib/editor/snippets/file/parseSnippetFile';
import { m } from '$lib/paraglide/messages';
import { isEngine } from '$lib/workspace/compileCommand';
import type { Argument, CommandEntry, Dependency, EnvironmentEntry, Key, PackageFile } from './types';

/** global first, then the folder's: each stacks on what comes before it */
const layers = new Map<string, PackageFile[]>();
let version = 0;

export function userLayers(name: string): PackageFile[] {
	return layers.get(name) ?? [];
}

export function userFileNames(): string[] {
	return [...layers.keys()];
}

/** changes whenever the package files do */
export function userFilesVersion(): number {
	return version;
}

export function setUserFiles(next: Map<string, PackageFile[]>): void {
	if (JSON.stringify([...next]) === JSON.stringify([...layers])) return;
	version++;
	layers.clear();
	for (const [name, files] of next) layers.set(name, files);
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringList(v: unknown): v is string[] {
	return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isArgument(v: unknown): v is Argument {
	return (
		isObject(v) &&
		typeof v.kind === 'string' &&
		(v.placeholder === undefined || typeof v.placeholder === 'string') &&
		(v.keys === undefined || isStringList(v.keys)) &&
		(v.values === undefined || isStringList(v.values))
	);
}

function isEntry(v: unknown): v is CommandEntry & EnvironmentEntry {
	if (!isObject(v) || typeof v.name !== 'string' || !v.name) return false;
	function argsOk(a: unknown): boolean {
		return a === undefined || a === null || (Array.isArray(a) && a.every(isArgument));
	}
	return argsOk(v.args) && (!isObject(v.star) || argsOk(v.star.args)) && (v.if === undefined || typeof v.if === 'string');
}

function isKey(v: unknown): v is Key {
	return isObject(v) && typeof v.key === 'string' && !!v.key;
}

function isDependency(v: unknown): v is Dependency {
	return (
		isObject(v) &&
		typeof v.id === 'string' &&
		(v.engines === undefined || (Array.isArray(v.engines) && v.engines.length > 0 && v.engines.every(isEngine)))
	);
}

export function parsePackageFile(text: string): { contents: PackageFile | null; problem: string | null } {
	let raw: unknown;
	try {
		raw = JSON.parse(stripJsonc(text));
	} catch (e) {
		return { contents: null, problem: notJson(text, e) };
	}
	if (!isObject(raw)) return { contents: null, problem: notObject() };
	if (raw.version !== 1) return { contents: null, problem: m.package_file_old_format() };
	let dropped = 0;
	function kept<T>(v: unknown, ok: (x: unknown) => x is T): T[] | undefined {
		if (!Array.isArray(v)) return undefined;
		const out = v.filter(ok);
		dropped += v.length - out.length;
		return out;
	}
	const contents: PackageFile = { version: 1 };
	const deps = kept(raw.deps, isDependency);
	const macros = kept(raw.macros, isEntry);
	const envs = kept(raw.envs, isEntry);
	if (deps) contents.deps = deps;
	if (macros) contents.macros = macros;
	if (envs) contents.envs = envs;
	if (isObject(raw.keys)) {
		contents.keys = {};
		for (const [group, list] of Object.entries(raw.keys)) {
			const keys = kept(list, isKey);
			if (keys) contents.keys[group] = keys;
			else dropped++;
		}
	}
	return { contents, problem: dropped ? m.package_file_entries_dropped({ count: dropped }) : null };
}
