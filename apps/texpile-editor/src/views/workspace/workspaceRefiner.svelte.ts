// Refine wiring: the reader's selection as a span of the open file, and the suggestion path it lands through
import { SelectionRefiner, refiner } from '$lib/ai/selectionRefiner';
import { collabHost } from '$lib/collab/hostStore.svelte';
import { fileMode } from '$lib/workspace/fileMode.svelte';
import { selectedSpan, type SpanDeps } from './selectedSpan';

type RefinerWiring = SpanDeps & { guest: () => boolean };

export function wireRefiner(d: RefinerWiring): void {
	const ctl = d.comments.ctl;
	const r = new SelectionRefiner({
		selection: () => selectedSpan(d),
		activeText: () => d.comments.activeText(),
		path: () => d.doc.path,
		// the same windows WorkspaceComments lets suggest
		canSuggest: () => !d.guest() && !collabHost.active && !fileMode.current && ctl.store.writable,
		suggestAs: (by, edit, note) => ctl.suggestions.suggestAs(by, edit, note),
		reveal: (id) => {
			const thread = ctl.threads.find((t) => t.id === id);
			if (thread) ctl.open(thread);
		}
	});
	$effect(() => {
		refiner.current = r;
		return () => {
			if (refiner.current === r) refiner.current = null;
		};
	});
}
