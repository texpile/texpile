import { problemSummary } from '$lib/editor/snippets/file/problemSummary';
import { packageFilePath, problemsIn, type SnippetFileList } from '$lib/editor/snippets/file/snippetFiles';
import type { SnippetProblem } from '$lib/editor/snippets/file/snippetTypes';

export type PackageLayer = 'project' | 'global';

export type PackageFileRow = { layer: PackageLayer; name: string; path: string; summary: string };

/** the package files of one layer, each with what went wrong parsing it */
export function packageFileRows(
	layer: PackageLayer,
	files: SnippetFileList,
	root: string | null,
	problems: readonly SnippetProblem[]
): PackageFileRow[] {
	return [...files.packages[layer]].sort().flatMap((name) => {
		const path = packageFilePath(layer, name, root, files);
		if (!path) return [];
		return [{ layer, name, path, summary: problemSummary(problemsIn({ kind: 'package', layer, name }, problems)) }];
	});
}
