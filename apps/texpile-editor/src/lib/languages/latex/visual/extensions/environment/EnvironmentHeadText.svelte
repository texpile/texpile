<!-- words of a head or note as the paper prints them: LaTeX in them (Proof of \propref{a}) drawn as what it prints -->
<script lang="ts">
	import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
	import { latexFace } from '../../core/walk/drawUnits';

	type Props = { text: string };
	const props: Props = $props();

	let face = $state.raw<ChipFace | null>(null);

	$effect(() => {
		const drawn = props.text.includes('\\') ? latexFace(props.text, false) : null;
		face = drawn;
		return () => drawn?.destroy?.();
	});

	function place(node: HTMLElement, dom: HTMLElement) {
		node.replaceChildren(dom);
		return { update: (next: HTMLElement) => node.replaceChildren(next) };
	}
</script>

{#if face}<span use:place={face.dom}></span>{:else}{props.text}{/if}
