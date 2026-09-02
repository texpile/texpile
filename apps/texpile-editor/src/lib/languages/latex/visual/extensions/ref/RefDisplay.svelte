<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import type { Node as PMNode } from 'prosemirror-model';
	import type { EditorView } from 'prosemirror-view';
	import { refState } from './refState';
	import { undefinedRefs } from './undefinedRefs.svelte';
	import { projectIntelStore } from '$lib/stores/projectIntel';

	let {
		node,
		view
	}: {
		node: PMNode;
		view: EditorView;
	} = $props();

	const label = $derived(node.textContent);

	const command = $derived(String(node.attrs?.command ?? 'ref'));

	const state = $derived(refState(command, label, projectIntelStore.current.auxNumbers, undefinedRefs.current));

	// the anchor in the document decides whether the jump happens, not whether we could resolve a
	// number. matching in js rather than in the selector keeps a label with a quote in it from
	// breaking the query.
	function handleClick(e: Event) {
		e.preventDefault();
		e.stopPropagation();

		for (const el of view.dom.querySelectorAll('[data-label], [imageplugin-label]')) {
			if (el.getAttribute('data-label') !== label && el.getAttribute('imageplugin-label') !== label) continue;
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		e.stopPropagation();
		handleClick(e);
	}
</script>

<!-- tinted text at the surrounding size, never a chip: the number the compiler prints belongs to
     the sentence, the way the citation beside it does. inline, not a button, so the padding cannot
     grow the line box. -->
<span
	class="cursor-pointer rounded py-0.5 transition-colors"
	class:text-blue-600={!state.broken}
	class:dark:text-blue-400={!state.broken}
	class:hover:bg-blue-50={!state.broken}
	class:dark:hover:bg-blue-950={!state.broken}
	class:text-red-600={state.broken}
	class:dark:text-red-400={state.broken}
	class:hover:bg-red-50={state.broken}
	class:dark:hover:bg-red-950={state.broken}
	role="button"
	tabindex="0"
	onclick={handleClick}
	onkeydown={handleKeydown}
	use:tip={state.broken ? `Label "${label}" not found` : state.text === label ? `Reference: ${label}` : `Reference to ${label}`}
	>{state.text}</span
>
