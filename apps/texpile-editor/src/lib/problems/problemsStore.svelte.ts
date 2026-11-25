// every check's rows in one list, split into the open file's and the project's
import { box } from '$lib/runes/box.svelte';
import { compileLog } from '$lib/stores/compileLogStore';
import { mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
import { liveRefProblems } from '$lib/workspace/document/liveRefChecks.svelte';
import { projectIgnored } from '$lib/workspace/projectConfigSync.svelte';
import { pathKey, samePath } from '$lib/workspace/fileSystem';
import { compileProblems } from './sources/compileProblems';
import { liveCheckProblems } from './sources/liveCheckProblems';
import { openFileProofread } from './sources/openFileProofread.svelte';
import { projectProblems } from './sources/projectChecks.svelte';
import { PROBLEM_FILTERS, type Problem, type ProblemFilter } from './problemTypes';

/** the file in the editor, set by the workspace */
export const problemsOpenFile = box<string | null>(null);

/** makes a file the main file, set by the workspace */
export const setMainFileFromProblems = box<((file: string) => Promise<void>) | null>(null);

export type ProblemGroup = { file: string | null; outside: boolean; problems: Problem[] };

function sameSpot(a: Problem, b: Problem): boolean {
	return a.line === b.line && !!a.file && !!b.file && samePath(a.file, b.file) && !!a.words && a.words === b.words;
}

function forOpen<T extends { path: string }>(found: T | null, open: string | null): T | null {
	return found && open && samePath(found.path, open) ? found : null;
}

function byLine(a: Problem, b: Problem): number {
	return (a.line ?? 0) - (b.line ?? 0);
}

function groupsOf(problems: Problem[]): ProblemGroup[] {
	const groups = new Map<string, ProblemGroup>();
	for (const p of problems) {
		const key = p.file ? pathKey(p.file) : p.outside ? 'outside' : '';
		let g = groups.get(key);
		if (!g) groups.set(key, (g = { file: p.file, outside: !!p.outside, problems: [] }));
		g.problems.push(p);
	}
	for (const g of groups.values()) g.problems.sort(byLine);
	// files by path, then what the compile named no file for, then files outside the folder
	function rank(g: ProblemGroup): number {
		return g.file ? 0 : g.outside ? 2 : 1;
	}
	return [...groups.values()].sort((a, b) => rank(a) - rank(b) || (a.file ?? '').localeCompare(b.file ?? ''));
}

class ProblemsView {
	/** filters turned off for this window; Boxes starts off as its checkbox did */
	hidden = $state<ReadonlySet<ProblemFilter>>(new Set(['box']));

	folded = $state({ file: false, project: false });

	all = $derived.by((): Problem[] => {
		const open = problemsOpenFile.current;
		const compiled = compileProblems(compileLog.current, workspaceRoot.current ?? '', mainFile.current);
		const live = liveCheckProblems(forOpen(liveRefProblems.current, open)).filter((p) => !compiled.some((c) => sameSpot(c, p)));
		const proofread = forOpen(openFileProofread.current, open)?.problems ?? [];
		const main = mainFile.current;
		const project = projectProblems.current;
		const document = main && project && samePath(project.main, main) ? project.problems : [];
		return [...compiled, ...live, ...proofread, ...document];
	});

	unignored = $derived.by(() => {
		const ignored = new Set(projectIgnored.current);
		return this.all.filter((p) => p.ignoreKey === null || !ignored.has(p.ignoreKey));
	});

	counts = $derived.by(() => {
		const counts = Object.fromEntries(PROBLEM_FILTERS.map((f) => [f, 0])) as Record<ProblemFilter, number>;
		for (const p of this.unignored) counts[p.filter]++;
		return counts;
	});

	private shown = $derived(this.unignored.filter((p) => !this.hidden.has(p.filter)));

	private isOpen(p: Problem): boolean {
		const open = problemsOpenFile.current;
		return !!open && !!p.file && samePath(p.file, open);
	}

	thisFile = $derived(this.shown.filter((p) => this.isOpen(p)).sort(byLine));

	project = $derived(groupsOf(this.shown.filter((p) => !this.isOpen(p))));

	toggle(filter: ProblemFilter): void {
		const next = new Set(this.hidden);
		if (next.has(filter)) next.delete(filter);
		else next.add(filter);
		this.hidden = next;
	}
}

export const problemsView = new ProblemsView();
