// the packages a document's files load, in the order TeX reads them: a file's uses at the point it is brought in
import { packageUseSitesIn } from '$lib/languages/latex/intellisense/packages/packageUses';
import type { DocumentPackageUse } from '$lib/languages/latex/intellisense/checks/latexChecks';
import { groupDepthsAt } from '$lib/languages/latex/intellisense/packages/groupDepth';
import { codeOnly } from '$lib/languages/latex/texCode';
import { pathKey, normalizePath } from '../fileSystem';
import { readKey } from './documentSources';
import { texIncludesIn } from './texIncludes';

type BroughtIn = { at: number; key: string };

/** uses and includes: where each stands in the file; reads: the path of each file it brings in (readKey); conditional: the
 * names a package or class the folder holds loads under a condition, in a group or in a macro, which may not load at all */
export type FileReading = {
	path: string;
	uses: DocumentPackageUse[];
	conditional: string[];
	includes: BroughtIn[];
	reads: ReadonlyMap<string, string>;
};

export function readingOf(path: string, text: string, reads: ReadonlyMap<string, string> = new Map(), library = false): FileReading {
	if (/\.typ$/i.test(path)) return { path, reads, uses: [], conditional: [], includes: [] };
	const code = codeOnly(text);
	// TeX stops reading at \end{document}
	const stop = code.search(/\\end\s*\{document\}/);
	function before(at: number): boolean {
		return stop < 0 || at < stop;
	}
	const found = packageUseSitesIn(text).filter((use) => before(use.at));
	// the name stands in the braces of the command that loads it, which sets the depth
	const nested = library
		? groupDepthsAt(
				code,
				found.map((use) => Math.max(0, code.lastIndexOf('\\', use.at)))
			)
		: [];
	return {
		path,
		reads,
		uses: found.filter((_, i) => !(nested[i] > 0)).map((use) => ({ ...use, path })),
		conditional: found.filter((_, i) => nested[i] > 0).map((use) => use.name),
		includes: texIncludesIn(code)
			.filter((i) => before(i.at))
			.map((i) => ({ at: i.at, key: readKey('include', i.name) }))
	};
}

/** every use of the files, the first file being the one TeX starts from; files nothing brings in come last */
export function usesInReadingOrder(files: readonly FileReading[]): DocumentPackageUse[] {
	const byPath = new Map(files.map((f) => [pathKey(normalizePath(f.path)), f]));
	const visited = new Set<string>();
	const out: DocumentPackageUse[] = [];
	function visit(file: FileReading): void {
		const key = pathKey(normalizePath(file.path));
		if (visited.has(key)) return;
		visited.add(key);
		const steps: { at: number; read?: string; use?: DocumentPackageUse }[] = [
			...file.includes.map((i) => ({ at: i.at, read: file.reads.get(i.key) })),
			...file.uses.map((use) => ({ at: use.at, use, read: file.reads.get(readKey('package', use.name)) }))
		];
		for (const step of steps.sort((a, b) => a.at - b.at)) {
			const child = step.read && byPath.get(pathKey(normalizePath(step.read)));
			if (child) visit(child);
			if (step.use) out.push(step.use);
		}
	}
	for (const file of files) visit(file);
	return out;
}

/** the names of what the files' packages and classes may load */
export function conditionalUseNames(files: readonly FileReading[]): string[] {
	return [...new Set(files.flatMap((f) => f.conditional))];
}
