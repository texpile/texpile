import { readTextFile, statFile, writeTextFile } from '$lib/workspace/fileSystem';
import { ensureTexpileIgnore, texpilePath } from '$lib/workspace/texpileDir';
import { getFolder, updateFolder } from '$lib/storage/workspaces';
import { settings, updateSettings } from '$lib/settings';
import { parseSnippetFile } from './parseSnippetFile';
import { setSnippetLayers } from './snippetRegistry';
import { adoptPackageFiles, type PackageTexts } from './packageFiles';
import type { SnippetFileList } from './snippetFiles';
import type { SnippetFile } from './snippetTypes';

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
// a guest has no folder to store the allowance or the switch in, so they last until the app closes
let sessionAllowedPatterns: string | null = null;
let sessionFolderOff = false;
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

let lastSource: [string | null, string | null] = [null, null];
// the last version of each file that loaded, and the folder it came from
const lastGood: Record<'global' | 'project', { owner: string; file: SnippetFile } | null> = { global: null, project: null };

/** a file broken mid edit keeps its last version that loaded, so an autosave of half a line does not switch it off */
function layerOf(text: string | null, layer: 'global' | 'project', on: boolean, owner: string): SnippetFile | null {
	if (text === null) lastGood[layer] = null;
	if (text === null || !on) return null;
	const fresh = parseSnippetFile(text, layer);
	const last = lastGood[layer]?.owner === owner ? lastGood[layer].file : null;
	if (!fresh.problems.some((p) => p.whole)) {
		lastGood[layer] = { owner, file: fresh };
		return fresh;
	}
	return last ? { ...last, problems: fresh.problems.map((p) => (p.whole ? { ...p, kept: true } : p)) } : fresh;
}
let switches = { global: true, folder: true };

/** whether each file is loaded, as of the last reload */
export function snippetSwitches(): { global: boolean; folder: boolean } {
	return switches;
}

/** a guest passes the host's text and no root; a lone file passes neither */
export async function reloadSnippets(root: string | null, hostFolderText: string | null = null): Promise<void> {
	lastSource = [root, hostFolderText];
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
	const on = { global: settings.current.globalSnippets !== false, folder: root ? getFolder(root).snippetsOff !== true : !sessionFolderOff };
	const key = JSON.stringify({ root, global, project, packages, on });
	if (key === loaded) return;
	// hand made files must reach git, an older ignore rule kept them out
	if (root && (project !== null || Object.keys(packages.project).length)) void ensureTexpileIgnore(root);
	loaded = key;
	folderText = project;
	const packagesKey = JSON.stringify(packages);
	const packagesChanged = packagesKey !== loadedPackages;
	loadedPackages = packagesKey;
	switches = on;
	setSnippetLayers({
		global: layerOf(global, 'global', on.global, ''),
		project: layerOf(project, 'project', on.folder, root ?? ''),
		allowedPatterns: root ? (getFolder(root).allowedSnippetPatterns ?? null) : sessionAllowedPatterns,
		packageProblems: adoptPackageFiles(packages)
	});
	if (packagesChanged) for (const cb of packageListeners) cb();
}

export function setGlobalSnippetsOn(on: boolean): void {
	updateSettings({ globalSnippets: on });
	void reloadSnippets(...lastSource);
}

/** kept on this machine, not in the folder: whether to load a project's snippets is one person's choice; a guest
 *  passes no root, for the host's */
export function setFolderSnippetsOn(root: string | null, on: boolean): void {
	if (root)
		updateFolder(root, (draft) => {
			if (on) delete draft.snippetsOff;
			else draft.snippetsOff = true;
		});
	else sessionFolderOff = !on;
	void reloadSnippets(...lastSource);
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
