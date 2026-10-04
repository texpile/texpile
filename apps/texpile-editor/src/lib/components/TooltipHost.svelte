<script lang="ts">
	// Draws the single hover hint. One per window: the app root mounts one, the popped-out
	// preview mounts another into its own document, and each draws only the tips raised in its
	// window. `use:tip` in tooltip.svelte.ts is what fills it.
	import { shownTip, hideTip, type ShownTip } from './tooltip.svelte';

	/** the window this host draws in; the popout passes its own */
	let { win = window }: { win?: Window } = $props();

	const GAP = 6;
	const EDGE = 6;

	let card = $state<HTMLDivElement | null>(null);
	// `for` keeps the card invisible until it has been measured against THIS trigger, so a second
	// hint never paints for a frame at the first one's coordinates. RAW because plain $state would
	// hand back a proxy of the tip it holds, which never === the tip itself.
	let placed = $state.raw<{ x: number; y: number; for: ShownTip } | null>(null);

	const mine = $derived(shownTip.current?.win === win ? shownTip.current : null);

	$effect(() => {
		const shown = mine;
		if (!shown || !card) return;
		const { offsetWidth: w, offsetHeight: h } = card;
		const x = Math.min(Math.max(EDGE, shown.rect.left + shown.rect.width / 2 - w / 2), win.innerWidth - w - EDGE);
		const below = shown.rect.bottom + GAP;
		const above = shown.rect.top - h - GAP;
		// a trigger that asks for above still goes below when there is no room up there
		const wantsAbove = shown.above ? above >= EDGE : below + h > win.innerHeight - EDGE;
		placed = { x, y: wantsAbove ? above : below, for: shown };
	});

	// the card is pinned to a rect measured once, so anything that moves the trigger under it
	// has to take it down rather than leave it stranded. On `win`, not svelte:window: that is
	// always the opener's
	$effect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') hideTip();
		}
		win.document.addEventListener('scroll', hideTip, true);
		win.addEventListener('resize', hideTip);
		win.addEventListener('keydown', onKey);
		return () => {
			win.document.removeEventListener('scroll', hideTip, true);
			win.removeEventListener('resize', hideTip);
			win.removeEventListener('keydown', onKey);
		};
	});
</script>

{#if mine}
	<div
		bind:this={card}
		role="tooltip"
		class="border-surface-300-700 bg-surface-50-950 text-surface-700-200 z-tooltip card pointer-events-none fixed max-w-xs border px-2 py-1 text-xs whitespace-pre-line shadow-lg"
		style="left: {placed?.x ?? 0}px; top: {placed?.y ?? 0}px; opacity: {placed?.for === mine ? 1 : 0}"
	>
		{mine.text}
	</div>
{/if}
