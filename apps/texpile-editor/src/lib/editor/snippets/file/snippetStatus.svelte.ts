import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { reloadSnippets } from './snippetLoader';
import { onSnippetRegistry, snippetRegistry } from './snippetRegistry';
import type { SnippetProblem } from './snippetTypes';
import { setCallWrappers } from '$lib/languages/typst/visual/callWrappers';

export const snippetStatus = $state({
	pendingPatterns: null as string | null,
	problems: [] as SnippetProblem[],
	/** counts changes to the Typst wrap names, which change what a call parses to */
	wrappers: 0
});

function describe(p: SnippetProblem): string {
	const file = p.file ?? (p.layer === 'project' ? '.texpile/snippets.json' : m.snippets_global_file());
	return p.name ? `${file}: "${p.name}" ${p.reason}` : `${file} ${p.reason}`;
}

let shown = '';
onSnippetRegistry(() => {
	const { pendingPatterns, problems, languages } = snippetRegistry();
	snippetStatus.pendingPatterns = pendingPatterns;
	snippetStatus.problems = problems;
	if (setCallWrappers(languages.typst.wraps.flatMap((c) => c.snippet.wrap ?? []))) snippetStatus.wrappers++;
	// once per new set of problems, not on every reload that finds the same ones
	const key = problems.map(describe).join('\n');
	if (key && key !== shown)
		toaster.warning({ title: m.snippets_problems_title({ count: problems.length }), description: describe(problems[0]) });
	shown = key;
});

/** the folder's snippets follow the open folder; null for a guest or a lone file */
export function followProjectSnippets(root: () => string | null): void {
	$effect(() => {
		void reloadSnippets(root());
	});
}
