import { joinPath, relativeInside, samePath } from '$lib/workspace/fileSystem';
import type { SnippetProblem } from './snippetTypes';

export type SnippetFileList = {
	global: string | null;
	globalPackages: string | null;
	packages: { project: string[]; global: string[] };
};

export type SnippetFileOpen =
	{ kind: 'snippets'; layer: 'project' | 'global' } | { kind: 'package'; layer: 'project' | 'global'; name: string };

const PACKAGE_FILE = /^([\w.+-]+)\.json$/i;

export function snippetFileAt(path: string, root: string | null, files: SnippetFileList): SnippetFileOpen | null {
	if (files.global && samePath(path, files.global)) return { kind: 'snippets', layer: 'global' };
	const inRoot = root ? relativeInside(root, path) : null;
	if (inRoot === '.texpile/snippets.json') return { kind: 'snippets', layer: 'project' };
	const project = inRoot?.startsWith('.texpile/packages/') ? PACKAGE_FILE.exec(inRoot.slice('.texpile/packages/'.length)) : null;
	if (project) return { kind: 'package', layer: 'project', name: project[1] };
	const inGlobal = files.globalPackages ? relativeInside(files.globalPackages, path) : null;
	const global = inGlobal ? PACKAGE_FILE.exec(inGlobal) : null;
	return global ? { kind: 'package', layer: 'global', name: global[1] } : null;
}

export function problemsIn(file: SnippetFileOpen, problems: readonly SnippetProblem[]): SnippetProblem[] {
	const own = file.kind === 'package' ? `${file.layer === 'project' ? '.texpile/' : ''}packages/${file.name}.json` : undefined;
	return problems.filter((p) => p.layer === file.layer && p.file === own);
}

export function packageFilePath(layer: 'project' | 'global', name: string, root: string | null, files: SnippetFileList): string | null {
	if (layer === 'global') return files.globalPackages ? joinPath(files.globalPackages, `${name}.json`) : null;
	return root ? `${root.replace(/[\\/]+$/, '')}/.texpile/packages/${name}.json` : null;
}

export function snippetDocsUrl(kind: 'snippets' | 'package'): string {
	return `https://texpile.com/docs/${kind === 'package' ? 'package-files' : 'snippets'}`;
}
