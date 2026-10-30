<script lang="ts">
	import { shownTip, hideTip, type ShownTip } from './tooltip';

	const GAP = 6;
	const EDGE = 6;

	/** the window this host draws in; each window draws only the tips raised in it */
	type Props = { win?: Window };
	const props: Props = $props();
	const win = $derived(props.win ?? window);

	let card = $state<HTMLDivElement | null>(null);
	// `for` hides the card until it is measured against this trigger, so a second hint never paints a frame at the
	// first one's place; raw, as a proxy of the tip would never === the tip
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

	// the card is pinned to a rect measured once, so anything that moves the trigger takes it down
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
		class="border-surface-300-700 bg-surface-50-950 text-surface-700-200 card pointer-events-none fixed z-50 max-w-xs border px-2 py-1 text-xs whitespace-pre-line shadow-lg"
		style:left="{placed?.x ?? 0}px"
		style:top="{placed?.y ?? 0}px"
		style:opacity={placed?.for === mine ? 1 : 0}
	>
		{mine.text}
	</div>
{/if}
