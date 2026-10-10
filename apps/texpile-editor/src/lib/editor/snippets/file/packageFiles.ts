import { mergePackages, parsePackageFile, setUserPackages } from '$lib/languages/latex/intellisense/userPackages';
import type { PackageData } from '$lib/languages/latex/intellisense/completion/packageData';
import type { SnippetProblem } from './snippetTypes';

export type PackageTexts = { global: Record<string, string>; project: Record<string, string> };

/** the package files in force, a project's entries over the global folder's; what could not be read */
export function adoptPackageFiles(texts: PackageTexts): SnippetProblem[] {
	const problems: SnippetProblem[] = [];
	function read(layer: 'global' | 'project', name: string, text: string): PackageData | null {
		const { contents, problem } = parsePackageFile(text);
		if (problem)
			problems.push({ layer, name: '', reason: problem, file: `${layer === 'project' ? '.texpile/' : ''}packages/${name}.json` });
		return contents;
	}
	const merged = new Map<string, PackageData>();
	for (const name of new Set([...Object.keys(texts.global), ...Object.keys(texts.project)])) {
		const global = name in texts.global ? read('global', name, texts.global[name]) : null;
		const project = name in texts.project ? read('project', name, texts.project[name]) : null;
		const contents = mergePackages(global, project);
		if (contents) merged.set(name, contents);
	}
	setUserPackages(merged);
	return problems;
}
