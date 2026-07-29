<script lang="ts">
	// Loading state for the visual editor while the worker parses. The bar is honest about WHAT
	// it knows: the phase labels come from real boundaries in the pipeline, but the movement
	// between them is an eased creep, because the longest step (unified-latex's sync parse) is a
	// single opaque call that reports nothing. It therefore never reaches 100% on its own: the
	// component unmounts when the doc actually arrives.
	//
	// `mounting` covers the step after that: ProseMirror building node views, which is one long
	// synchronous block on the main thread. Nothing driven from JS survives it - the creep interval
	// stops and a width transition freezes mid-animation, which reads as a hung app. So that phase
	// switches to an indeterminate bar animated purely on `transform`, which Chromium runs on the
	// compositor and keeps moving while the main thread is completely blocked.
	import { Loader2 } from '@lucide/svelte';
	import type { ParsePhase } from '$lib/workspace/latexRoundtrip';
	import { m } from '$lib/paraglide/messages';

	let {
		phase = null,
		sizeBytes = 0,
		onUseSource,
		mounting = false
	}: { phase?: ParsePhase | null; sizeBytes?: number; onUseSource?: () => void; mounting?: boolean } = $props();

	// escalate with the wait instead of flashing the heaviest UI at every switch: most parses
	// finish inside 300ms and should show nothing at all.
	let stage = $state<'none' | 'spinner' | 'bar'>('none');

	// each phase's floor is the previous phase's ceiling: reaching a real boundary snaps the bar
	// forward, and within a phase the creep approaches the ceiling without touching it, so a slow
	// phase reads as "still working" rather than "finished"
	const FLOOR: Record<ParsePhase, number> = { parsing: 2, building: 55, finalizing: 88 };
	const CEIL: Record<ParsePhase, number> = { parsing: 55, building: 88, finalizing: 97 };
	const ceiling = $derived(CEIL[phase ?? 'parsing']);

	let pct = $state(2);
	// a big file is the whole reason this UI exists; say so rather than spinning silently
	let slow = $state(false);

	$effect(() => {
		const creep = setInterval(() => {
			pct = Math.min(ceiling, pct + (ceiling - pct) * 0.06);
		}, 100);
		return () => clearInterval(creep);
	});

	// own effect: a phase change must not re-arm these timers
	$effect(() => {
		const toSpinner = setTimeout(() => (stage = 'spinner'), 300);
		const toBar = setTimeout(() => (stage = 'bar'), 1000);
		const toSlow = setTimeout(() => (slow = true), 2000);
		return () => {
			clearTimeout(toSpinner);
			clearTimeout(toBar);
			clearTimeout(toSlow);
		};
	});

	$effect(() => {
		const floor = FLOOR[phase ?? 'parsing'];
		if (pct < floor) pct = floor;
	});

	// the block is known to be coming, so skip the escalation and show the bar straight away
	const shown = $derived(mounting ? 'bar' : stage);

	const label = $derived(
		mounting
			? m.wsview_loading_rendering()
			: phase === 'finalizing'
				? m.wsview_loading_finalizing()
				: phase === 'building'
					? m.wsview_loading_building()
					: m.wsview_loading_parsing()
	);
	const sizeText = $derived(sizeBytes >= 1_000_000 ? `${(sizeBytes / 1_048_576).toFixed(1)} MB` : `${Math.round(sizeBytes / 1024)} KB`);
</script>

{#if shown === 'spinner'}
	<div class="text-surface-500 mt-12 flex items-center justify-center gap-2 text-sm">
		<Loader2 class="size-4 animate-spin" />
		{m.wsview_opening()}
	</div>
{:else if shown === 'bar'}
	<div class="mx-auto mt-24 flex max-w-sm flex-col items-center px-6 text-center" class:reveal-late={mounting}>
		<div class="bg-surface-200-800 h-1 w-full overflow-hidden rounded-full">
			{#if mounting}
				<div class="bg-primary-500 indeterminate h-full w-1/4 rounded-full"></div>
			{:else}
				<div class="bg-primary-500 h-full rounded-full transition-[width] duration-200 ease-out" style="width: {pct}%"></div>
			{/if}
		</div>
		<p class="text-surface-500 mt-3 text-sm">{label}</p>

		{#if slow}
			<p class="text-surface-400 mt-2 text-xs">{m.wsview_loading_large_note({ size: sizeText })}</p>
			{#if onUseSource}
				<button class="text-primary-500 mt-3 text-xs hover:underline" onclick={onUseSource}>
					{m.wsview_loading_use_source()}
				</button>
			{/if}
		{/if}
	</div>
{/if}

<style>
	/* The same "nothing below 300 ms" rule the parse phase gets from its timers, done in CSS because
	   the mount blocks the main thread: a setTimeout armed beforehand would not fire until the block
	   ended, revealing the bar exactly as it stopped being useful. An animation delay is kept by the
	   animation timeline instead, so the bar reveals itself mid-block if the block runs long, and is
	   removed from the DOM still invisible if it does not.

	   This also drops any assumption about how fast the machine is. A slower CPU crosses 300 ms on a
	   smaller document and gets the bar there; a faster one does not. Nothing to calibrate. */
	.reveal-late {
		opacity: 0;
		animation: reveal-after-delay 180ms ease-out 300ms forwards;
	}

	@keyframes reveal-after-delay {
		to {
			opacity: 1;
		}
	}

	/* transform and nothing else: Chromium runs this on the compositor, so it keeps sliding through
	   the synchronous ProseMirror mount that blocks the main thread. Animating width or left here
	   would freeze mid-bar and look like a hung app. */
	.indeterminate {
		animation: indeterminate-slide 1.1s ease-in-out infinite;
		will-change: transform;
	}

	@keyframes indeterminate-slide {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(400%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.indeterminate {
			animation-duration: 2.4s;
		}
	}
</style>
