<script lang="ts">
	import { domOf } from '$lib/editor/visual/extensions/drawnChips/chipFace';
	import { openChipPanel, syncChipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel/chipPanel.svelte';
	import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
	import { typesetStaticMathIn } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
	import { m } from '$lib/paraglide/messages';
	import { tip } from '$lib/components/tooltip.svelte';
	import type { PreambleSpan } from '$lib/languages/latex/visual/core/title/preambleFields';

	type Props = {
		command: string;
		text: string;
		span: PreambleSpan;
		caret: number;
		onEdit?: (span: PreambleSpan, command: string) => void;
	};
	const props: Props = $props();

	let field = $state<HTMLElement>();
	let faceDom = $state.raw<HTMLElement | null>(null);

	$effect(() => {
		const drawn = latexFace(props.command, true);
		const dom = drawn && domOf(drawn);
		if (dom) typesetStaticMathIn(dom);
		faceDom = dom;
		return () => drawn?.destroy?.();
	});

	function place(node: HTMLElement, dom: HTMLElement) {
		node.replaceChildren(dom);
		return { update: (next: HTMLElement) => node.replaceChildren(next) };
	}

	// an undo reaches the preamble a few ticks later
	$effect(() => {
		if (field) syncChipPanel(field, props.command);
	});

	function open(): void {
		const view = editorViewStore.current;
		if (!field || !view) return;
		const anchor = field;
		const span = props.span;
		openChipPanel({
			anchor,
			source: props.command,
			caret: props.caret,
			language: 'latex',
			inline: false,
			settingsFor: () => null,
			write: (next) => props.onEdit?.(span, next),
			writeSetting: (next) => props.onEdit?.(span, next),
			jump: () => {},
			jumpToDefinition: () => {},
			view,
			undo: () => void undoVisual(),
			redo: () => void redoVisual(),
			onClose: (how) => {
				if (how !== 'away') anchor.focus();
			}
		});
	}
</script>

{#if faceDom}
	<div
		bind:this={field}
		class="title-field"
		role="button"
		tabindex="0"
		use:place={faceDom}
		use:tip={m.title_edit_source()}
		onclick={open}
		onkeydown={(e) => e.key === 'Enter' && open()}
	></div>
{:else}
	<div
		bind:this={field}
		class="title-field-source"
		role="button"
		tabindex="0"
		use:tip={m.title_edit_source()}
		onclick={open}
		onkeydown={(e) => e.key === 'Enter' && open()}
	>
		{props.text}
	</div>
{/if}
