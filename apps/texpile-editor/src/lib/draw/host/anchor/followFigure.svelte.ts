import { untrack } from 'svelte';
import { collabHost } from '$lib/collab/hostStore.svelte';
import { liveText } from '$lib/buffers/liveText.svelte';
import { placeOf, type FigurePlace } from './figureAnchors';

/** the file's text as any editor of it changes it, and where the figure is in it; called during init */
export function followFigure(figure: () => { id: string; path: string }): { readonly text: string; readonly place: FigurePlace | null } {
	let text = $state('');
	let place = $state.raw<FigurePlace | null>(null);
	$effect(() => {
		void collabHost.manifestRev;
		const { id, path } = figure();
		const binding = collabHost.collabFor(path);
		if (!binding) return;
		const now = liveText(binding.ytext);
		untrack(() => {
			text = now;
			place = placeOf(id, binding.ytext, now);
		});
	});
	return {
		get text() {
			return text;
		},
		get place() {
			return place;
		}
	};
}
