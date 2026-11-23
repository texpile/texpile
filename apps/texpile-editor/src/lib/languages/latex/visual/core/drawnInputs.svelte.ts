// one watch over what drawn chips are drawn from (the compile's .aux, the definitions, the preamble's names) for every
// drawn chip on the page; a reactive root per chip was most of what a reference cost to draw
import { untrack } from 'svelte';
import { liveRefProblems } from '$lib/workspace/document/liveRefChecks.svelte';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { referenceStore, templateFeaturesStore } from '$lib/stores/editorStore';
import { undefinedRefs } from '../extensions/ref/undefinedRefs.svelte';
import type { RefProblem } from '$lib/languages/latex/refCheck';

const redraws = new Set<() => void>();
let stop: (() => void) | null = null;

/** the problems a chip draws: their places move with every key, which redraws nothing */
function drawnProblemsKey(problems: readonly RefProblem[] | undefined): string {
	let key = '';
	for (const p of problems ?? [])
		if (p.kind === 'label-twice') key += `label\0${p.name}\0${p.elsewhere ?? ''}\n`;
		else if (p.kind === 'file-missing' && p.what === 'input') key += `input\0${p.name}\n`;
	return key;
}

/** calls `redraw` whenever those inputs change, until the returned function is called */
export function onDrawnInputs(redraw: () => void): () => void {
	redraws.add(redraw);
	stop ??= $effect.root(() => {
		let drawnFrom: readonly unknown[] = [];
		$effect(() => {
			// the stores signal a reassignment of the same value too, which draws nothing new
			const inputs = [
				projectIntelStore.current,
				templateFeaturesStore.current,
				undefinedRefs.current,
				referenceStore.current,
				drawnProblemsKey(liveRefProblems.current?.problems)
			];
			if (inputs.every((input, i) => input === drawnFrom[i])) return;
			drawnFrom = inputs;
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
