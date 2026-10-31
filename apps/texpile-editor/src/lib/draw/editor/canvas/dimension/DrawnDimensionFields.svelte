<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import type { CanvasGesture } from '../../state/gesture/canvasGesture.svelte';
	import { previewDimensions } from './previewDimensions';

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	const typed = $derived(props.gesture.typed);
	const preview = $derived(props.gesture.preview);
	const dimensions = $derived(
		preview ? previewDimensions(preview, (u, v) => props.editor.toCanvas(u, v), props.editor.viewport.scale) : []
	);
	const fields = $derived(typed.fields);
	const LABELS = {
		length: () => m.figure_dim_length(),
		angle: () => m.figure_dim_angle(),
		width: () => m.figure_dim_width(),
		height: () => m.figure_dim_height(),
		diameter: () => m.figure_dim_diameter()
	};

	function focusWhenFocused(el: HTMLInputElement, k: number) {
		if (typed.focused !== k) return;
		el.focus();
		const end = el.value.length;
		el.setSelectionRange(end, end);
	}

	function onkeydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }, k: number) {
		e.stopPropagation();
		if (e.key === 'Tab') {
			e.preventDefault();
			typed.focused = (k + (e.shiftKey ? fields.length - 1 : 1)) % fields.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const field = e.currentTarget;
			if (props.gesture.placeTyped()) field.closest<HTMLElement>('[role="application"]')?.focus();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			typed.close();
			e.currentTarget.closest<HTMLElement>('[role="application"]')?.focus();
		}
	}
</script>

{#each dimensions as d (d.field)}
	{@const [x, y] = props.editor.viewport.toScreen(...d.label)}
	{@const k = fields.indexOf(d.field)}
	<div
		class="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
		style:left="{x}px"
		style:top="{y}px"
	>
		{#if typed.open && k >= 0}
			{#key typed.focused}
				<input
					class="border-primary-500 bg-surface-50-950 rounded-base pointer-events-auto w-16 border px-1 py-0.5 text-center font-mono text-xs shadow-lg outline-none"
					aria-label={LABELS[d.field]()}
					placeholder={d.shown}
					bind:value={typed.values[k]}
					onkeydown={(e) => onkeydown(e, k)}
					onfocus={() => (typed.focused = k)}
					oninput={() => props.gesture.followTyped()}
					{@attach (el) => focusWhenFocused(el, k)}
				/>
			{/key}
		{:else}
			<span class="bg-surface-50-950/90 text-primary-ink rounded-base px-1 font-mono text-xs">{d.shown}</span>
		{/if}
	</div>
{/each}
