import { parsePackageFile, setUserFiles } from '$lib/languages/latex/knowledge/userFiles';
import type { PackageFile } from '$lib/languages/latex/knowledge/types';
import type { SnippetProblem } from './snippetTypes';

export type PackageTexts = { global: Record<string, string>; project: Record<string, string> };

/** the folder's file stacks on the global one; returns what could not be read */
export function adoptPackageFiles(texts: PackageTexts): SnippetProblem[] {
	const problems: SnippetProblem[] = [];
	function read(layer: 'global' | 'project', name: string, text: string): PackageFile | null {
		const { contents, problem } = parsePackageFile(text);
		if (problem)
			problems.push({
				layer,
				name: '',
				reason: problem,
				file: `${layer === 'project' ? '.texpile/' : ''}packages/${name}.json`,
				whole: contents === null
			});
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
