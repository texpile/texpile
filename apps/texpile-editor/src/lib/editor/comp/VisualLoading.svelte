<script lang="ts">
	// Loading state for the visual editor while the worker parses. The bar is honest about WHAT
	// it knows: the phase labels come from real boundaries in the pipeline, but the movement
	// between them is an eased creep, because the longest step (unified-latex's sync parse) is a
	// single opaque call that reports nothing. It therefore never reaches 100% on its own: the
	// component unmounts when the doc actually arrives.
	import { Loader2 } from '@lucide/svelte';
	import type { ParsePhase } from '$lib/workspace/latexRoundtrip';
	import { m } from '$lib/paraglide/messages';

	let { phase = null, sizeBytes = 0, onUseSource }: { phase?: ParsePhase | null; sizeBytes?: number; onUseSource?: () => void } = $props();

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

	const label = $derived(
		phase === 'finalizing' ? m.wsview_loading_finalizing() : phase === 'building' ? m.wsview_loading_building() : m.wsview_loading_parsing()
	);
	const sizeText = $derived(sizeBytes >= 1_000_000 ? `${(sizeBytes / 1_048_576).toFixed(1)} MB` : `${Math.round(sizeBytes / 1024)} KB`);
</script>

{#if stage === 'spinner'}
	<div class="text-surface-500 mt-12 flex items-center justify-center gap-2 text-sm">
		<Loader2 class="size-4 animate-spin" />
		{m.wsview_opening()}
	</div>
{:else if stage === 'bar'}
	<div class="mx-auto mt-24 flex max-w-sm flex-col items-center px-6 text-center">
		<div class="bg-surface-200-800 h-1 w-full overflow-hidden rounded-full">
			<div class="bg-primary-500 h-full rounded-full transition-[width] duration-200 ease-out" style="width: {pct}%"></div>
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
