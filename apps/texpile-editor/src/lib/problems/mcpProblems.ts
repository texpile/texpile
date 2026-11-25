// get_problems: the Problems tab's rows, as the writer sees them with every filter on
import { workspaceRoot, mainFile } from '$lib/workspace/workspaceStore';
import { relativeTo, samePath } from '$lib/workspace/fileSystem';
import { resolveInWorkspace } from '$lib/workspace/mcpWorkspacePath';
import { problemsOpenFile, problemsView } from './problemsStore.svelte';
import { PROBLEM_FILTERS, type ProblemFilter } from './problemTypes';

const MAX_PROBLEMS = 200;

export function problemsPayload(args: Record<string, unknown>) {
	const root = workspaceRoot.current;
	function rel(p: string | null): string | null {
		return p && root ? relativeTo(root, p) : p;
	}
	const kind = PROBLEM_FILTERS.includes(args.kind as ProblemFilter) ? (args.kind as ProblemFilter) : null;
	const file = typeof args.file === 'string' ? resolveInWorkspace(args.file) : null;
	const rows = problemsView.unignored.filter((p) => (!kind || p.filter === kind) && (!file || (!!p.file && samePath(p.file, file))));
	return {
		openFile: rel(problemsOpenFile.current),
		mainFile: rel(mainFile.current),
		counts: problemsView.counts,
		total: rows.length,
		problems: rows
			.slice()
			.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0))
			.slice(0, MAX_PROBLEMS)
			.map((p) => ({
				kind: p.filter,
				file: p.outside ? null : rel(p.file),
				line: p.line,
				message: p.message,
				words: p.words ?? null,
				fix: p.fix?.label ?? null
			}))
	};
}
