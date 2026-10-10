import { readTextFile, statFile, writeTextFile } from '$lib/workspace/fileSystem';
import { ensureTexpileIgnore, texpilePath } from '$lib/workspace/texpileDir';
import { getFolder, updateFolder } from '$lib/storage/workspaces';
import { parseSnippetFile } from './parseSnippetFile';
import { setSnippetLayers } from './snippetRegistry';
import { adoptPackageFiles, type PackageTexts } from './packageFiles';

type SnippetsBridge = {
	readGlobal(): Promise<string | null>;
	revealGlobal(): Promise<string>;
	readPackages(root: string | null): Promise<PackageTexts>;
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

export function revealGlobalSnippets(): Promise<string | null> {
	return bridge()?.revealGlobal() ?? Promise.resolve(null);
}
