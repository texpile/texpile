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
let loadedPackages = JSON.stringify(NO_PACKAGES);
let folderText: string | null = null;
// a guest has no folder to store the allowance in, so it lasts until the app closes
let sessionAllowedPatterns: string | null = null;
const packageListeners = new Set<() => void>();
let locations: Promise<{ snippets: string; packages: string } | null> | null = null;
let files: SnippetFileList = { global: null, globalPackages: null, packages: { project: [], global: [] } };

export function snippetFiles(): SnippetFileList {
	return files;
}

/** sent by a host to its guests */
export function folderSnippetText(): string | null {
	return folderText;
}

/** a guest passes the host's text and no root; a lone file passes neither */
export async function reloadSnippets(root: string | null, hostFolderText: string | null = null): Promise<void> {
	const [global, project, packages] = await Promise.all([
		bridge()
			?.readGlobal()
			.catch(() => null) ?? null,
		root ? readProjectFile(root) : hostFolderText,
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
	// hand made files must reach git, an older ignore rule kept them out
	if (root && (project !== null || Object.keys(packages.project).length)) void ensureTexpileIgnore(root);
	loaded = key;
	folderText = project;
	const packagesKey = JSON.stringify(packages);
	const packagesChanged = packagesKey !== loadedPackages;
	loadedPackages = packagesKey;
	setSnippetLayers({
		global: global === null ? null : parseSnippetFile(global, 'global'),
		project: project === null ? null : parseSnippetFile(project, 'project'),
		allowedPatterns: root ? (getFolder(root).allowedSnippetPatterns ?? null) : sessionAllowedPatterns,
		packageProblems: adoptPackageFiles(packages)
	});
	if (packagesChanged) for (const cb of packageListeners) cb();
}

/** package files change the macro signatures a parse reads */
export function onPackageFilesChanged(cb: () => void): () => void {
	packageListeners.add(cb);
	return () => packageListeners.delete(cb);
}

/** allows the project's regex triggers as they stand; a guest passes no root */
export function allowProjectSnippetPatterns(root: string | null, patterns: string): void {
	if (root)
		updateFolder(root, (draft) => {
			draft.allowedSnippetPatterns = patterns;
		});
	else sessionAllowedPatterns = patterns;
	setSnippetLayers({ allowedPatterns: patterns });
}

const STARTER = '{\n\t"v": 1,\n\t"snippets": {\n\t}\n}\n';

export async function ensureProjectSnippets(root: string): Promise<string | null> {
	const path = texpilePath(root, 'snippets.json');
	if (!path) return null;
	if (!(await statFile(path)).exists) {
		await ensureTexpileIgnore(root);
		await writeTextFile(path, STARTER);
	}
	return path;
}

export function ensureGlobalSnippets(): Promise<string | null> {
	return bridge()?.ensureGlobal() ?? Promise.resolve(null);
}

/** also fires for global package files */
export function onGlobalSnippetsChanged(cb: () => void): () => void {
	return bridge()?.onGlobalChanged(cb) ?? (() => {});
}

export async function readTexPackage(file: string): Promise<string | null> {
	return (await bridge()?.texPackage(file)) ?? null;
}
