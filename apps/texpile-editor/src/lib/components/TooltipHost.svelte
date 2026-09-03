<script lang="ts">
	// Draws the single hover hint. Mounted once, at the app root; `use:tip` in tooltip.svelte.ts
	// is what fills it.
	import { shownTip, hideTip, type ShownTip } from './tooltip.svelte';

	const GAP = 6;
	const EDGE = 6;

	let card = $state<HTMLDivElement | null>(null);
	// `for` keeps the card invisible until it has been measured against THIS trigger, so a second
	// hint never paints for a frame at the first one's coordinates. RAW because plain $state would
	// hand back a proxy of the tip it holds, which never === the tip itself.
	let placed = $state.raw<{ x: number; y: number; for: ShownTip } | null>(null);

	$effect(() => {
		const shown = shownTip.current;
		if (!shown || !card) return;
		const { offsetWidth: w, offsetHeight: h } = card;
		const x = Math.min(Math.max(EDGE, shown.rect.left + shown.rect.width / 2 - w / 2), window.innerWidth - w - EDGE);
		const below = shown.rect.bottom + GAP;
		placed = { x, y: below + h > window.innerHeight - EDGE ? shown.rect.top - h - GAP : below, for: shown };
	});

	// the card is pinned to a rect measured once, so anything that moves the trigger under it
	// has to take it down rather than leave it stranded
	$effect(() => {
		document.addEventListener('scroll', hideTip, true);
		window.addEventListener('resize', hideTip);
		return () => {
			document.removeEventListener('scroll', hideTip, true);
			window.removeEventListener('resize', hideTip);
		};
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && hideTip()} />

{#if shownTip.current}
	<div
		bind:this={card}
		role="tooltip"
		class="border-surface-300-700 bg-surface-50-950 text-surface-700-200 z-tooltip pointer-events-none fixed max-w-xs card border px-2 py-1 text-xs whitespace-pre-line shadow-lg"
		style="left: {placed?.x ?? 0}px; top: {placed?.y ?? 0}px; opacity: {placed?.for === shownTip.current ? 1 : 0}"
	>
		{shownTip.current.text}
	</div>
{/if}
