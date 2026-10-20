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

// the kinds docs/package-files.md lists
const ARGUMENT_KINDS = new Set(['m', 'o', 's', 'v', 'd()', 'd<>', 'r()', 'r<>']);
export const MACRO_NAME = /^(?:[A-Za-z@]+|[^A-Za-z@\s])$/;
export const ENVIRONMENT_NAME = /^[^\s{}\\%*]+$/;

function optional(v: unknown, type: 'string' | 'true'): boolean {
	return v === undefined || (type === 'true' ? v === true : typeof v === type);
}

function isArgument(v: unknown): v is Argument {
	return (
		isObject(v) &&
		typeof v.kind === 'string' &&
		ARGUMENT_KINDS.has(v.kind) &&
		optional(v.default, 'string') &&
		(v.placeholder === undefined || typeof v.placeholder === 'string') &&
		(v.keys === undefined || isStringList(v.keys)) &&
		(v.values === undefined || isStringList(v.values))
	);
}

function argsOk(a: unknown): boolean {
	return a === undefined || a === null || (Array.isArray(a) && a.every(isArgument));
}

function fieldsOk(v: Record<string, unknown>): boolean {
	return (
		argsOk(v.args) &&
		optional(v.if, 'string') &&
		optional(v.doc, 'string') &&
		optional(v.prints, 'string') &&
		optional(v.hidden, 'true') &&
		optional(v.remove, 'true')
	);
}

function isMacro(v: unknown): v is CommandEntry {
	return (
		isObject(v) &&
		typeof v.name === 'string' &&
		MACRO_NAME.test(v.name) &&
		fieldsOk(v) &&
		(v.in === undefined || v.in === 'math' || v.in === 'text')
	);
}

function isEnvironment(v: unknown): v is EnvironmentEntry {
	return (
		isObject(v) &&
		typeof v.name === 'string' &&
		ENVIRONMENT_NAME.test(v.name) &&
		fieldsOk(v) &&
		(v.in === undefined || v.in === 'math') &&
		(v.star === undefined || (isObject(v.star) && fieldsOk(v.star)))
	);
}

function isKey(v: unknown): v is Key {
	return (
		isObject(v) &&
		typeof v.key === 'string' &&
		!!v.key &&
		optional(v.bare, 'true') &&
		optional(v.placeholder, 'string') &&
		(v.values === undefined || isStringList(v.values)) &&
		optional(v.default, 'string') &&
		optional(v.if, 'string')
	);
}

function isDependency(v: unknown): v is Dependency {
	return (
		isObject(v) &&
		typeof v.id === 'string' &&
		(v.engines === undefined || (Array.isArray(v.engines) && v.engines.length > 0 && v.engines.every(isEngine)))
	);
}

/** problem: why the whole file did not load; dropped: the entries left out, by name where they have one */
export function parsePackageFile(text: string): { contents: PackageFile | null; problem: string | null; dropped: string[] } {
	let raw: unknown;
	try {
		raw = JSON.parse(stripJsonc(text));
	} catch (e) {
		return { contents: null, problem: notJson(text, e), dropped: [] };
	}
	if (!isObject(raw)) return { contents: null, problem: notObject(), dropped: [] };
	if (raw.version !== 1) return { contents: null, problem: m.package_file_old_format(), dropped: [] };
	const dropped: string[] = [];
	// an entry with no name of its own is named by where it stands, as macros[2]
	function kept<T>(v: unknown, ok: (x: unknown) => x is T, list: string): T[] | undefined {
		if (v === undefined) return undefined;
		if (!Array.isArray(v)) {
			dropped.push(list);
			return undefined;
		}
		v.forEach((x, i) => {
			if (ok(x)) return;
			const name = isObject(x) ? (x.name ?? x.key ?? x.id) : undefined;
			dropped.push(typeof name === 'string' ? name : `${list}[${i}]`);
		});
		return v.filter(ok);
	}
	const contents: PackageFile = { version: 1 };
	const deps = kept(raw.deps, isDependency, 'deps');
	const macros = kept(raw.macros, isMacro, 'macros');
	const envs = kept(raw.envs, isEnvironment, 'envs');
	if (deps) contents.deps = deps;
	if (macros) contents.macros = macros;
	if (envs) contents.envs = envs;
	if (isObject(raw.keys)) {
		contents.keys = {};
		for (const [group, list] of Object.entries(raw.keys)) {
			const keys = kept(list, isKey, `keys.${group}`);
			if (keys) contents.keys[group] = keys;
		}
	} else if (raw.keys !== undefined) dropped.push('keys');
	return { contents, problem: null, dropped };
}
