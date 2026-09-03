<script lang="ts" module>
	/**
	 * The four states the compile slot can be in, and the tonal preset each wears.
	 *
	 * The label is pinned a step darker than the preset's own (800 in light, 200 in dark) because
	 * a tonal preset puts its text on its own tint - the same hue at both ends - which reads as
	 * washed out.
	 *
	 * The hairline is the button's OWN hue at 30%, not a solid one: a full-strength outline round
	 * a pale fill reads as a highlight ring rather than an edge. At 30% it is enough to separate
	 * the button from the toolbar behind it and nothing more.
	 *
	 * `filter-none` on hover overrides Skeleton's own `.btn` hover, which is
	 * `filter: brightness(125%)` in light mode (and 75% in dark). Brightening a tonal preset whose
	 * light-mode fill is already the 50 shade pushes it to white and takes the label and the
	 * hairline up with it, since a filter applies to the whole element - that is the glow. One
	 * step deeper in the same hue is what a hover should do at both ends.
	 */
	export type CompileTone = 'primary' | 'success' | 'warning' | 'error';
	export const COMPILE_TONE: Record<CompileTone, string> = {
		primary: 'preset-tonal-primary text-primary-ink border border-primary-500/30 hover:filter-none hover:bg-primary-500/20',
		success: 'preset-tonal-success text-success-ink border border-success-500/30 hover:filter-none hover:bg-success-500/20',
		warning: 'preset-tonal-warning text-warning-ink border border-warning-500/30 hover:filter-none hover:bg-warning-500/20',
		error: 'preset-tonal-error text-error-ink border border-error-500/30 hover:filter-none hover:bg-error-500/20'
	};
</script>

<script lang="ts">
	// The left half of the topbar's compile split-button. One element wearing whichever state the
	// toolbar is in - Compile, Preview, Live, Paused, Stop - because those differed only in colour,
	// icon, label and click, and five near-identical <button> blocks drifted apart every time one
	// of them was touched. The chevron beside it is the caller's (it belongs to the menu, not to a
	// state) and reads its colour from COMPILE_TONE above, so the pair always matches.
	import { tip } from '$lib/components/tooltip.svelte';
	import type { Component } from 'svelte';

	type Props = {
		tone: CompileTone;
		label: string;
		title: string;
		onclick: () => void;
		/** lucide icon for the leading slot; omit when `dot` marks a running state instead */
		icon?: Component | null;
		/** the filled status dot the live/running states use in place of an icon */
		dot?: boolean;
		/** greyed and inert; the title says why. Enforcement is in runCompile, not here. */
		disabled?: boolean;
	};
	let { tone, label, title, onclick, icon = null, dot = false, disabled = false }: Props = $props();
</script>

<!-- one fixed width for every state: Compile, Preview, Live, Paused and Stop occupy the same
     slot, and a button that resized as the state changed made the whole group jump -->
<button
	class="btn btn-xs {COMPILE_TONE[
		tone
	]} w-24 justify-center gap-1.5 rounded-r-none whitespace-nowrap disabled:pointer-events-none disabled:opacity-50"
	{onclick}
	use:tip={title}
	{disabled}
>
	{#if dot}
		<!-- the dot rides inside a size-4 box, the exact slot the icons occupy: the button's height
		     is content-driven, and a bare 8px dot let the Live state come out ~3px shorter than the
		     icon states - and ~1px shorter than its own chevron half, which pokes past the seam -->
		<span class="flex size-4 items-center justify-center">
			<span class="bg-success-500 size-2 rounded-full"></span>
		</span>
	{:else if icon}
		{@const Icon = icon}
		<Icon class="size-4" />
	{/if}
	{label}
</button>
