<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { FIELD_LABEL, SEGMENTS, segmentClass } from '../../ui/panelStyles';
	import { tip } from '$lib/components/tooltip.svelte';
	import type { FigureColors } from '../../figure/figureLanguage';
	import { colorLabel } from '../styleLabels';

	// as wide as a column allows, up to its size: a narrow panel shrinks the row rather than wrapping its last swatch
	const SWATCH = 'border-surface-300-700 relative aspect-square w-full max-w-5 justify-self-center rounded-full border';
	// Texpile's picked tile
	const PICKED = 'ring-primary-500 ring-offset-surface-50-950 ring-2 ring-offset-2';

	/** `mixed`: the shapes have different colors, and none is picked */
	type Props = {
		label: string;
		value: string | null;
		mixed?: boolean;
		allowNone: boolean;
		colors: FigureColors;
		onpick: (color: string | null) => void;
	};
	const props: Props = $props();

	const parts = $derived(props.colors.split(props.value));
	const known = $derived(props.colors.swatches.some(([name]) => name === parts.base));
</script>

<div class="px-3 pt-2.5">
	<div class="{FIELD_LABEL} flex justify-between">
		<span>{props.label}</span><span class="font-mono font-normal"
			>{props.mixed ? m.figure_color_value_mixed() : (props.value ?? m.figure_color_value_none())}</span
		>
	</div>
	<div
		class="grid gap-1.5"
		style:grid-template-columns="repeat({props.colors.swatches.length + (props.allowNone ? 1 : 0)}, minmax(0, 1fr))"
	>
		{#if props.allowNone}
			<button
				class="{SWATCH} bg-surface-100-900 {props.value === null && !props.mixed ? PICKED : ''}"
				aria-pressed={props.value === null && !props.mixed}
				aria-label={m.figure_color_none()}
				use:tip={m.figure_color_none()}
				onclick={() => props.onpick(null)}
				><span class="text-swatch-clear absolute inset-0 flex items-center justify-center text-xs">✕</span></button
			>
		{/if}
		{#each props.colors.swatches as [name, hex] (name)}
			<button
				class="{SWATCH} {parts.base === name ? PICKED : ''}"
				aria-pressed={parts.base === name}
				style="background: {props.colors.swatchFill(hex, parts.base === name ? parts.shade : '100')}"
				aria-label={colorLabel(name)}
				use:tip={colorLabel(name)}
				onclick={() => props.onpick(props.colors.join(name, parts.base ? parts.shade : '100'))}
			></button>
		{/each}
	</div>
	{#if props.value !== null && known && !props.mixed}
		<div class="{SEGMENTS} mt-2" role="group" aria-label={m.figure_color_shade({ label: props.label })}>
			{#each props.colors.shades as s (s)}
				<button
					class={segmentClass(parts.shade === s)}
					aria-pressed={parts.shade === s}
					onclick={() => props.onpick(props.colors.join(parts.base!, s))}>{s}%</button
				>
			{/each}
		</div>
	{/if}
</div>
