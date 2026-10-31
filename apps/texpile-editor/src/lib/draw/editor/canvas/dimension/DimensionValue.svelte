<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { dimensionValue } from '../../state/dimension/geometry/dimensionGeometry';
	import { readTypedAngle, readTypedLength } from '../../state/typedDraw/typedLength';
	import { formatNumber } from '../../figure/numbers';
	import { dimensionDrawing } from './dimensionDrawing';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const dimension = $derived(props.editor.dimension);
	const shown = $derived(dimension.placed ?? dimension.following);
	const place = $derived.by(() => {
		const drawing = shown && dimensionDrawing(shown.target, shown.placement, props.editor.viewport.scale);
		return drawing ? props.editor.viewport.toScreen(...drawing.label) : null;
	});
	const angled = $derived(shown?.target.kind === 'angle');
	const value = $derived(shown ? formatNumber(dimensionValue(shown.target, shown.placement)) : '');
	const mark = $derived(shown?.target.kind === 'radius' ? 'R ' : shown?.target.kind === 'node' && shown.target.round ? 'Ø ' : '');
	let wrong = $state(false);

	function begin(el: HTMLInputElement) {
		wrong = false;
		el.focus();
		el.select();
	}

	// back to the canvas, so the tool's keys work again
	function leave(field: HTMLInputElement) {
		field.closest<HTMLElement>('[role="application"]')?.focus();
	}

	function onkeydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		e.stopPropagation();
		const field = e.currentTarget;
		if (e.key === 'Escape') {
			e.preventDefault();
			dimension.clear();
			leave(field);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const typed = angled ? readTypedAngle(field.value) : readTypedLength(field.value);
			// a size sets it, any other text is what it prints, as a figure names a side
			if (typed !== null) wrong = !dimension.apply(typed);
			else wrong = !field.value.trim() || !dimension.name(field.value.trim());
			if (!wrong) leave(field);
		}
	}
</script>

{#if shown && place}
	<div
		class="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
		style:left="{place[0]}px"
		style:top="{place[1]}px"
	>
		{#if dimension.placed}
			{#key dimension.placed}
				<input
					class="bg-surface-50-950 rounded-base pointer-events-auto w-20 border border-(--warning-ink) px-1.5 py-0.5 text-center font-mono text-sm shadow-lg outline-none {wrong
						? 'border-error-500'
						: ''}"
					aria-label={angled ? m.figure_dim_value_degrees() : m.figure_dim_value_cm()}
					aria-invalid={wrong}
					value={dimension.placed.label ?? value}
					{onkeydown}
					oninput={() => (wrong = false)}
					{@attach begin}
				/>
			{/key}
			<span class="text-muted text-xs">{angled ? '°' : 'cm'}</span>
		{:else}
			<span class="bg-surface-50-950/90 rounded-base px-1 font-mono text-xs text-(--warning-ink)">{mark}{value}{angled ? '°' : ' cm'}</span>
		{/if}
	</div>
{/if}
