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
import { setCallLooks, type CallDialect } from '../visual/callWrappers';
import { applyCallLookStyles, callLookCss } from '../visual/callLookStyles';
import type { CallLook } from './snippetTypes';
import type { CallLooks } from '$lib/collab/parse/parseContext';

export const snippetStatus = $state({
	pendingPatterns: null as string | null,
	loaded: snippetRegistry().loaded,
	/** whether each file is loaded */
	switches: snippetSwitches(),
	problems: [] as SnippetProblem[],
	/** bumped when wrap names change, which changes how calls parse */
	wrappers: 0,
	/** bumped when package files change */
	packages: 0,
	files: snippetFiles() as SnippetFileList,
	folderText: null as string | null,
	/** this side's own looks, which a host shares with guests */
	looks: { latex: new Map(), typst: new Map() } as CallLooks
});

// a guest parses with its host's looks, not its own
let sessionLooks: CallLooks | null = null;

function applyCallLooks(looks: CallLooks): void {
	let reparse = false;
	for (const dialect of ['latex', 'typst'] as CallDialect[]) {
		if (setCallLooks(dialect, looks[dialect])) reparse = true;
		if (typeof document !== 'undefined') applyCallLookStyles(dialect, callLookCss(dialect, looks[dialect]));
	}
	if (reparse) snippetStatus.wrappers++;
}

/** null goes back to this side's own looks */
export function useSessionCallLooks(looks: CallLooks | null): void {
	sessionLooks = looks;
	applyCallLooks(looks ?? snippetStatus.looks);
}

export function describeSnippetProblem(p: SnippetProblem): string {
	const file = p.file ?? (p.layer === 'project' ? '.texpile/snippets.json' : m.snippets_global_file());
	return p.name ? `${file}, "${p.name}": ${p.reason}` : `${file}: ${p.reason}`;
}

onPackageFilesChanged(() => snippetStatus.packages++);

let shown = '';
onSnippetRegistry(() => {
	const { pendingPatterns, problems, languages, loaded } = snippetRegistry();
	snippetStatus.pendingPatterns = pendingPatterns;
	snippetStatus.loaded = loaded;
	snippetStatus.switches = snippetSwitches();
	snippetStatus.problems = problems;
	const files = snippetFiles();
	snippetStatus.files = files;
	snippetStatus.folderText = folderSnippetText();
	allowTabsOutsideRoot((path) => snippetFileAt(path, null, files)?.layer === 'global');
	function looksOf(dialect: CallDialect): Map<string, CallLook> {
		return new Map(
			languages[dialect].wraps.flatMap((c) => (c.snippet.wrap && c.snippet.visual ? [[c.snippet.wrap, c.snippet.visual]] : []))
		);
	}
	snippetStatus.looks = { latex: looksOf('latex'), typst: looksOf('typst') };
	applyCallLooks(sessionLooks ?? snippetStatus.looks);
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
