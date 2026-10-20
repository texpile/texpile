import { parsePackageFile, setUserFiles } from '$lib/languages/latex/knowledge/userFiles';
import type { PackageFile } from '$lib/languages/latex/knowledge/types';
import { m } from '$lib/paraglide/messages';
import type { SnippetProblem } from './snippetTypes';

export type PackageTexts = { global: Record<string, string>; project: Record<string, string> };

/** the folder's file stacks on the global one; returns what could not be read */
export function adoptPackageFiles(texts: PackageTexts): SnippetProblem[] {
	const problems: SnippetProblem[] = [];
	function read(layer: 'global' | 'project', name: string, text: string): PackageFile | null {
		const { contents, problem, dropped } = parsePackageFile(text);
		const file = `${layer === 'project' ? '.texpile/' : ''}packages/${name}.json`;
		if (problem) problems.push({ layer, name: '', reason: problem, file, whole: true });
		for (const entry of dropped) problems.push({ layer, name: entry, reason: m.package_file_entry_dropped(), file });
		return contents;
	}
	const layers = new Map<string, PackageFile[]>();
	for (const name of new Set([...Object.keys(texts.global), ...Object.keys(texts.project)])) {
		const global = name in texts.global ? read('global', name, texts.global[name]) : null;
		const project = name in texts.project ? read('project', name, texts.project[name]) : null;
		const files = [global, project].filter((f): f is PackageFile => !!f);
		if (files.length) layers.set(name, files);
	}
	setUserFiles(layers);
	return problems;
}
