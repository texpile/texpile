import { readTextFile, statFile, writeTextFile } from '$lib/workspace/fileSystem';
import { ensureTexpileIgnore, texpilePath } from '$lib/workspace/texpileDir';
import { getFolder, updateFolder } from '$lib/storage/workspaces';
import { parseSnippetFile } from './parseSnippetFile';
import { setSnippetLayers } from './snippetRegistry';
import { adoptPackageFiles, type PackageTexts } from './packageFiles';
import type { SnippetFileList } from './snippetFiles';

type SnippetsBridge = {
	readGlobal(): Promise<string | null>;
	ensureGlobal(): Promise<string>;
	locations(): Promise<{ snippets: string; packages: string }>;
	onGlobalChanged(cb: () => void): () => void;
	readPackages(root: string | null): Promise<PackageTexts>;
	texPackage(name: string): Promise<string | null>;
};

function bridge(): SnippetsBridge | undefined {
	return (globalThis.window as unknown as { texpileSnippets?: SnippetsBridge } | undefined)?.texpileSnippets;
}

async function readProjectFile(root: string | null): Promise<string | null> {
	const path = root ? texpilePath(root, 'snippets.json') : null;
	if (!path || !(await statFile(path)).exists) return null;
	return readTextFile(path).catch(() => null);
}

const NO_PACKAGES: PackageTexts = { global: {}, project: {} };
let loaded: string | null = null;
let locations: Promise<{ snippets: string; packages: string } | null> | null = null;
let files: SnippetFileList = { global: null, globalPackages: null, packages: { project: [], global: [] } };

/** the files the last reload read */
export function snippetFiles(): SnippetFileList {
	return files;
}

/** read the snippet and package files again; a guest or a lone file passes no root and gets the global ones alone */
export async function reloadSnippets(root: string | null): Promise<void> {
	const [global, project, packages] = await Promise.all([
		bridge()
			?.readGlobal()
			.catch(() => null) ?? null,
		readProjectFile(root),
		bridge()
			?.readPackages(root)
			.catch(() => NO_PACKAGES) ?? NO_PACKAGES
	]);
	locations ??=
		bridge()
			?.locations()
			.catch(() => null) ?? Promise.resolve(null);
	const where = await locations;
	files = {
		global: where?.snippets ?? null,
		globalPackages: where?.packages ?? null,
		packages: { project: Object.keys(packages.project), global: Object.keys(packages.global) }
	};
	const key = JSON.stringify({ root, global, project, packages });
	if (key === loaded) return;
	// a file made by hand still has to reach git: an older ignore rule kept it out
	if (root && (project !== null || Object.keys(packages.project).length)) void ensureTexpileIgnore(root);
	loaded = key;
	setSnippetLayers({
		global: global === null ? null : parseSnippetFile(global, 'global'),
		project: project === null ? null : parseSnippetFile(project, 'project'),
		allowedPatterns: root ? (getFolder(root).allowedSnippetPatterns ?? null) : null,
		packageProblems: adoptPackageFiles(packages)
	});
}

/** the project's regex triggers, allowed on this machine as they stand */
export function allowProjectSnippetPatterns(root: string, patterns: string): void {
	updateFolder(root, (draft) => {
		draft.allowedSnippetPatterns = patterns;
	});
	setSnippetLayers({ allowedPatterns: patterns });
}

const STARTER = '{\n\t"v": 1,\n\t"snippets": {\n\t}\n}\n';

/** the project's snippet file, made empty first if there is none; its path */
export async function ensureProjectSnippets(root: string): Promise<string | null> {
	const path = texpilePath(root, 'snippets.json');
	if (!path) return null;
	if (!(await statFile(path)).exists) {
		await ensureTexpileIgnore(root);
		await writeTextFile(path, STARTER);
	}
	return path;
}

/** the global snippet file, made empty first if missing; its path */
export function ensureGlobalSnippets(): Promise<string | null> {
	return bridge()?.ensureGlobal() ?? Promise.resolve(null);
}

/** the global file or a global package file changed; returns the unsubscribe */
export function onGlobalSnippetsChanged(cb: () => void): () => void {
	return bridge()?.onGlobalChanged(cb) ?? (() => {});
}

/** a .sty from the TeX installation by file name; null when it has none */
export async function readTexPackage(file: string): Promise<string | null> {
	return (await bridge()?.texPackage(file)) ?? null;
}
