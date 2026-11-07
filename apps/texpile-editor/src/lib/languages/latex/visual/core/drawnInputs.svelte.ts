// one watch over what drawn chips are drawn from (the compile's .aux, the definitions, the preamble's names) for every
// drawn chip on the page; a reactive root per chip was most of what a reference cost to draw
import { untrack } from 'svelte';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { referenceStore, templateFeaturesStore } from '$lib/stores/editorStore';
import { undefinedRefs } from '../extensions/ref/undefinedRefs.svelte';

const redraws = new Set<() => void>();
let stop: (() => void) | null = null;

/** calls `redraw` whenever those inputs change, until the returned function is called */
export function onDrawnInputs(redraw: () => void): () => void {
	redraws.add(redraw);
	stop ??= $effect.root(() => {
		$effect(() => {
			void projectIntelStore.current;
			void templateFeaturesStore.current;
			void undefinedRefs.current;
			void referenceStore.current;
			untrack(() => redraws.forEach((fn) => fn()));
		});
	});
	return () => {
		redraws.delete(redraw);
		if (redraws.size) return;
		stop?.();
		stop = null;
	};
}
