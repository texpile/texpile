<script lang="ts">
	import { LockOpen } from '@lucide/svelte';
	import { toggleLocked } from '../../objects/lockCommands';
	import type { CanvasGesture } from '../../state/gesture/canvasGesture.svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { lockedBox } from './lockedBox';

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	const i = $derived(props.gesture.lockedShown);
	const box = $derived(i ? lockedBox(props.editor, i) : null);
	const topLeft = $derived(box ? props.editor.viewport.toScreen(box.x, box.y + box.h) : null);

	function unlock() {
		toggleLocked(props.editor, [i]);
		props.gesture.lockedShown = 0;
	}
</script>

{#if topLeft}
	<button
		class="btn-icon btn-icon-sm preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal absolute -translate-y-full shadow-lg"
		style:left="{topLeft[0]}px"
		style:top="{topLeft[1] - 12}px"
		aria-label="Unlock"
		use:tip={'Unlock'}
		onpointerdown={(e) => e.stopPropagation()}
		onclick={unlock}><LockOpen class="size-4" /></button
	>
{/if}
