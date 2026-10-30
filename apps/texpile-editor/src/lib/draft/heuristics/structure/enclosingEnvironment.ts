import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { environmentName } from '$lib/languages/latex/syntax/treeMode';

/** the innermost environment that holds the text of a 1-based line, not counting one that opens on the line itself */
export function enclosingEnvironmentName(source: { src: string; lines: string[] }, line: number): string | null {
	const text = source.lines[line - 1] ?? '';
	let at = 0;
	for (let i = 0; i < line - 1; i++) at += source.lines[i].length + 1;
	at += text.length - text.trimStart().length;
	for (let node = latexTreeOf(source.src).resolveInner(at, 1); node.parent; node = node.parent) {
		if ((node.name === 'Environment' || node.name === 'VerbatimEnvironment') && node.from < at && at < node.to && node.firstChild)
			return environmentName(source.src, node.firstChild);
	}
	return null;
}
