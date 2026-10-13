import { untrack } from 'svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import {
	snippetSwitches,
	folderSnippetText,
	onGlobalSnippetsChanged,
	onPackageFilesChanged,
	reloadSnippets,
	snippetFiles
} from './snippetLoader';
import { problemsIn, snippetFileAt, type SnippetFileList } from './snippetFiles';
import { activeFilePath, workspaceRoot } from '$lib/workspace/workspaceStore';
import { allowTabsOutsideRoot } from '$lib/workspace/tabs.svelte';
import { onSnippetRegistry, snippetRegistry } from './snippetRegistry';
import type { SnippetProblem } from './snippetTypes';

export const snippetStatus = $state({
	pendingPatterns: null as string | null,
	loaded: snippetRegistry().loaded,
	/** whether each file is loaded */
	switches: snippetSwitches(),
	problems: [] as SnippetProblem[],
	/** bumped when package files change */
	packages: 0,
	files: snippetFiles() as SnippetFileList,
	folderText: null as string | null
});

export function describeSnippetProblem(p: SnippetProblem): string {
	const file = p.file ?? (p.layer === 'project' ? '.texpile/snippets.json' : m.snippets_global_file());
	return p.name ? `${file}, "${p.name}": ${p.reason}` : `${file}: ${p.reason}`;
}

onPackageFilesChanged(() => snippetStatus.packages++);

let shown = '';
onSnippetRegistry(() => {
	const { pendingPatterns, problems, loaded } = snippetRegistry();
	snippetStatus.pendingPatterns = pendingPatterns;
	snippetStatus.loaded = loaded;
	snippetStatus.switches = snippetSwitches();
	snippetStatus.problems = problems;
	const files = snippetFiles();
	snippetStatus.files = files;
	snippetStatus.folderText = folderSnippetText();
	allowTabsOutsideRoot((path) => snippetFileAt(path, null, files)?.layer === 'global');
	// the file open in the editor has its own bar saying what failed, and changes on every autosave
	const open = activeFilePath.current ? snippetFileAt(activeFilePath.current, workspaceRoot.current, files) : null;
	// a warning is for when the file is open: its snippet still works
	const told = problems.filter((p) => !p.warning && !(open && problemsIn(open, [p]).length));
	const key = told.map(describeSnippetProblem).join('\n');
	if (key && key !== shown)
		toaster.warning({ title: m.snippets_problems_title({ count: told.length }), description: describeSnippetProblem(told[0]) });
	shown = key;
});

export type FolderSnippetsSource = { root: string | null; hostText: string | null };

export function followProjectSnippets(source: () => FolderSnippetsSource): void {
	$effect(() => {
		const { root, hostText } = source();
		void reloadSnippets(root, hostText);
	});
	$effect(() =>
		onGlobalSnippetsChanged(() => {
			const { root, hostText } = untrack(source);
			void reloadSnippets(root, hostText);
		})
	);
}
