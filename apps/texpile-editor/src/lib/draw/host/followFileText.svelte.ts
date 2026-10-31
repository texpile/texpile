import { untrack } from 'svelte';
import { collabHost } from '$lib/collab/hostStore.svelte';
import { liveText } from '$lib/buffers/liveText.svelte';

/** the file's text as any editor of it changes it (a source pane beside the figure, the paper); called during init */
export function followFileText(path: () => string, take: (text: string) => void): void {
	$effect(() => {
		void collabHost.manifestRev;
		const binding = collabHost.collabFor(path());
		if (!binding) return;
		const text = liveText(binding.ytext);
		untrack(() => take(text));
	});
}
