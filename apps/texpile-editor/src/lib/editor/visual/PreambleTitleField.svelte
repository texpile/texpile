<!-- one command of the title block that lives in the preamble, drawn as the block prints it; a click opens its argument in
  the chip panel, and an edit goes straight back into the preamble -->
<script lang="ts">
	import { tick } from 'svelte';
	import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
	import { openChipPanel, syncChipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
	import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
	import { m } from '$lib/paraglide/messages';
	import { tip } from '$lib/components/tooltip.svelte';
	import type { PreambleSpan } from '$lib/languages/latex/visual/core/title/preambleFields';

	// `command` is the whole command, `text` the argument an edit replaces at `span`
	type Props = { command: string; text: string; span: PreambleSpan; onEdit?: (span: PreambleSpan, text: string) => void };
	const props: Props = $props();

	let field = $state<HTMLElement>();
	let face = $state.raw<ChipFace | null>(null);

	// drawn again when the command changes or the document's package data arrives
	$effect(() => {
		const drawn = latexFace(props.command, true);
		face = drawn;
		return () => drawn?.destroy?.();
	});

	function place(node: HTMLElement, dom: HTMLElement) {
		node.replaceChildren(dom);
		return { update: (next: HTMLElement) => node.replaceChildren(next) };
	}

	function step(run: () => boolean): void {
		run();
		void tick().then(() => field && syncChipPanel(field, props.text));
	}

	function open(): void {
		const view = editorViewStore.current;
		if (!field || !view) return;
		const anchor = field;
		const span = props.span;
		openChipPanel({
			anchor,
			source: props.text,
			language: 'latex',
			inline: false,
			settingsFor: () => null,
			write: (next) => props.onEdit?.(span, next),
			writeSetting: (next) => props.onEdit?.(span, next),
			jump: () => {},
			jumpToDefinition: () => {},
			view,
			undo: () => step(undoVisual),
			redo: () => step(redoVisual),
			onClose: (how) => {
				if (how !== 'away') anchor.focus();
			}
		});
	}
</script>

{#if face}
	<div
		bind:this={field}
		class="title-field"
		role="button"
		tabindex="0"
		use:place={face.dom}
		use:tip={m.title_edit_source()}
		onclick={open}
		onkeydown={(e) => e.key === 'Enter' && open()}
	></div>
{:else}
	<!-- a command the editor cannot draw shows its argument as written -->
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
