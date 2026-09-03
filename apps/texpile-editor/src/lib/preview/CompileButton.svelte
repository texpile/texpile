<script lang="ts" module>
	/**
	 * The states the compile slot can be in. They all wear the one filled primary: on Skeleton's
	 * own recipe the fill is the single action a surface offers, drawn with the theme's contrast
	 * token so it reads on every preset. What state we are in is told by the label, the leading
	 * icon or dot, and the problems button beside it - not by recolouring the action.
	 *
	 * The map is kept so callers can still name a tone; every entry resolves to the same classes.
	 */
	export type CompileTone = 'primary' | 'success' | 'warning' | 'error';
	export const COMPILE_TONE: Record<CompileTone, string> = {
		primary: 'preset-filled-primary-500',
		success: 'preset-filled-primary-500',
		warning: 'preset-filled-primary-500',
		error: 'preset-filled-primary-500'
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
