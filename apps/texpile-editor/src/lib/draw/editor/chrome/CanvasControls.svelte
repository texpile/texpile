<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { ListTree, Redo2, RefreshCw, Undo2, ZoomIn, ZoomOut } from '@lucide/svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { CANVAS_PILL } from '../ui/panelStyles';
	import { redoShortcutText, shortcutText } from './menubar/shortcutText';
	import NaturalSizeControl from './NaturalSizeControl.svelte';
	import ZoomMenu from './ZoomMenu.svelte';

	const BUTTON = 'rounded-base hover:preset-tonal flex size-7 items-center justify-center transition-colors';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
</script>

<div class="absolute bottom-3 left-3 z-20 flex items-center gap-2">
	<div class={CANVAS_PILL} role="group" aria-label={m.figure_zoom_controls()}>
		<button
			class={BUTTON}
			onclick={() => props.editor.viewport.zoomOut()}
			aria-label={m.figure_zoom_out()}
			use:tip={m.figure_zoom_out_tip({ shortcut: shortcutText('-') })}><ZoomOut class="size-4 shrink-0" /></button
		>
		<ZoomMenu editor={props.editor} />
		<button
			class={BUTTON}
			onclick={() => props.editor.viewport.zoomIn()}
			aria-label={m.figure_zoom_in()}
			use:tip={m.figure_zoom_in_tip({ shortcut: shortcutText('+') })}><ZoomIn class="size-4 shrink-0" /></button
		>
	</div>
	<div class={CANVAS_PILL} role="group" aria-label={m.figure_history()}>
		<button
			class={BUTTON}
			onclick={() => props.editor.undo()}
			aria-label={m.figure_cmd_undo()}
			use:tip={m.figure_undo_tip({ shortcut: shortcutText('Z') })}><Undo2 class="size-4 shrink-0" /></button
		>
		<button
			class={BUTTON}
			onclick={() => props.editor.redo()}
			aria-label={m.figure_cmd_redo()}
			use:tip={m.figure_redo_tip({ shortcut: redoShortcutText() })}><Redo2 class="size-4 shrink-0" /></button
		>
		<button class={BUTTON} onclick={() => props.editor.redraw()} aria-label={m.figure_redraw()} use:tip={m.figure_redraw()}
			><!-- smaller: its drawing fills the icon's box -->
			<RefreshCw class="size-3.5 shrink-0" /></button
		>
	</div>
	{#if props.editor.panes.compact}
		{@const panes = props.editor.panes}
		<div class={CANVAS_PILL}>
			<button
				class="{BUTTON} {panes.objectsShown ? 'bg-primary-tint text-primary-ink' : ''}"
				aria-pressed={panes.objectsShown}
				onclick={() => (panes.objectsShown = !panes.objectsShown)}
				aria-label={m.figure_objects()}
				use:tip={m.figure_objects()}><ListTree class="size-4 shrink-0" /></button
			>
		</div>
	{/if}
</div>
<NaturalSizeControl editor={props.editor} />
