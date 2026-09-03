<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import type { Node as PMNode } from 'prosemirror-model';
	import type { EditorView } from 'prosemirror-view';
	import { refState } from './refState';
	import { undefinedRefs } from './undefinedRefs.svelte';
	import { projectIntelStore } from '$lib/stores/projectIntel';
	import { flashNodeAt } from '$lib/editor/visual/extensions/flash-plugin';

	let {
		node,
		view,
		onJumpToLabel
	}: {
		node: PMNode;
		view: EditorView;
		/** the label is not drawn in this document; true when the workspace jumped to it */
		onJumpToLabel?: (name: string) => boolean;
	} = $props();

	const label = $derived(node.textContent);

	const command = $derived(String(node.attrs?.command ?? 'ref'));

	const state = $derived(refState(command, label, projectIntelStore.current.auxNumbers, undefinedRefs.current));

	// the anchor in the document decides whether the jump happens, not whether we could resolve a
	// number. matching in js rather than in the selector keeps a label with a quote in it from
	// breaking the query. nothing drawn here: the workspace knows this file's raw environments
	// and the other project files, so the jump is its to make.
	function handleClick(e: Event) {
		e.preventDefault();
		e.stopPropagation();

		for (const el of view.dom.querySelectorAll('[data-label], [imageplugin-label]')) {
			if (el.getAttribute('data-label') !== label && el.getAttribute('imageplugin-label') !== label) continue;
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			flashBlockHolding(el);
			return;
		}
		onJumpToLabel?.(label);
	}

	// the top-level block the anchor sits in, flashed the way a SyncTeX landing is. found by
	// containment, not identity: the anchor can be an inline \label chip inside a paragraph
	function flashBlockHolding(el: Element) {
		const doc = view.state.doc;
		for (let i = 0, pos = 0; i < doc.childCount; pos += doc.child(i).nodeSize, i++) {
			if (view.nodeDOM(pos)?.contains(el)) return flashNodeAt(view, pos);
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
	class="cursor-pointer rounded-base py-0.5 transition-colors"
	class:text-ref-fg={!state.broken}
	class:hover:bg-ref-bg={!state.broken}
	class:text-ref-broken-fg={state.broken}
	class:hover:bg-ref-broken-bg={state.broken}
	role="button"
	tabindex="0"
	onclick={handleClick}
	onkeydown={handleKeydown}
	use:tip={state.broken ? `Label "${label}" not found` : state.text === label ? `Reference: ${label}` : `Reference to ${label}`}
	>{state.text}</span
>
