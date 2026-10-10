import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { reloadSnippets } from './snippetLoader';
import { onSnippetRegistry, snippetRegistry } from './snippetRegistry';
import type { SnippetProblem } from './snippetTypes';
import { setCallLooks, type CallDialect } from '../visual/callWrappers';
import { applyCallLookStyles, callLookCss } from '../visual/callLookStyles';
import type { CallLook } from './snippetTypes';

export const snippetStatus = $state({
	pendingPatterns: null as string | null,
	problems: [] as SnippetProblem[],
	/** counts changes to the declared wrap names, which change what a call parses to */
	wrappers: 0
});

/** a problem as one line: the file, the entry and why */
export function describeSnippetProblem(p: SnippetProblem): string {
	const file = p.file ?? (p.layer === 'project' ? '.texpile/snippets.json' : m.snippets_global_file());
	return p.name ? `${file}: "${p.name}" ${p.reason}` : `${file} ${p.reason}`;
}

let shown = '';
onSnippetRegistry(() => {
	const { pendingPatterns, problems, languages } = snippetRegistry();
	snippetStatus.pendingPatterns = pendingPatterns;
	snippetStatus.problems = problems;
	let reparse = false;
	for (const dialect of ['latex', 'typst'] as CallDialect[]) {
		const looks = new Map<string, CallLook>(
			languages[dialect].wraps.flatMap((c) => (c.snippet.wrap && c.snippet.visual ? [[c.snippet.wrap, c.snippet.visual]] : []))
		);
		if (setCallLooks(dialect, looks)) reparse = true;
		if (typeof document !== 'undefined') applyCallLookStyles(dialect, callLookCss(dialect, looks));
	}
	if (reparse) snippetStatus.wrappers++;
	// once per new set of problems, not on every reload that finds the same ones
	const key = problems.map(describeSnippetProblem).join('\n');
	if (key && key !== shown)
		toaster.warning({ title: m.snippets_problems_title({ count: problems.length }), description: describeSnippetProblem(problems[0]) });
	shown = key;
});

/** the folder's snippets follow the open folder; null for a guest or a lone file */
export function followProjectSnippets(root: () => string | null): void {
	$effect(() => {
		void reloadSnippets(root());
	});
}
