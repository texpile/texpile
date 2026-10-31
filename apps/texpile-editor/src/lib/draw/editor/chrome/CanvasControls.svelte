<script lang="ts">
	import { Redo2, RefreshCw, Undo2, ZoomIn, ZoomOut } from '@lucide/svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { redoShortcutText, shortcutText } from './menubar/shortcutText';
	import ZoomMenu from './ZoomMenu.svelte';

	const PILL = 'bg-surface-50-950 border-surface-200-800 rounded-container flex items-center gap-0.5 border p-0.5 shadow-lg';
	const BUTTON = 'rounded-base hover:preset-tonal flex size-7 items-center justify-center transition-colors';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
</script>

<!-- zoom and history float in the canvas's corner, as Excalidraw keeps them, so the canvas runs to the top -->
<div class="absolute bottom-3 left-3 z-20 flex items-center gap-2">
	<div class={PILL} role="group" aria-label="Zoom controls">
		<button class={BUTTON} onclick={() => props.editor.viewport.zoomOut()} aria-label="Zoom out" use:tip={`Zoom out (${shortcutText('-')})`}
			><ZoomOut class="size-4 shrink-0" /></button
		>
		<ZoomMenu editor={props.editor} />
		<button class={BUTTON} onclick={() => props.editor.viewport.zoomIn()} aria-label="Zoom in" use:tip={`Zoom in (${shortcutText('+')})`}
			><ZoomIn class="size-4 shrink-0" /></button
		>
	</div>
	<div class={PILL} role="group" aria-label="History">
		<button class={BUTTON} onclick={() => props.editor.undo()} aria-label="Undo" use:tip={`Undo (${shortcutText('Z')})`}
			><Undo2 class="size-4 shrink-0" /></button
		>
		<button class={BUTTON} onclick={() => props.editor.redo()} aria-label="Redo" use:tip={`Redo (${redoShortcutText()})`}
			><Redo2 class="size-4 shrink-0" /></button
		>
		<button class={BUTTON} onclick={() => props.editor.redraw()} aria-label="Draw again" use:tip={'Draw again'}
			><RefreshCw class="size-4 shrink-0" /></button
		>
	</div>
</div>
