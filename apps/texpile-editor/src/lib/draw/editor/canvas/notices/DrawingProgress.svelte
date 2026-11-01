<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { LoaderCircle } from '@lucide/svelte';

	type Props = { busy: boolean; engineName: string };
	const props: Props = $props();

	// a quick redraw passes unannounced; a slow one says it is working, so it does not look stuck
	const SHOWN_AFTER_MS = 500;
	const LONG_AFTER_MS = 10000;
	let waited = $state(0);
	$effect(() => {
		if (!props.busy) return;
		const shown = setTimeout(() => (waited = 1), SHOWN_AFTER_MS);
		const long = setTimeout(() => (waited = 2), LONG_AFTER_MS);
		return () => {
			clearTimeout(shown);
			clearTimeout(long);
			waited = 0;
		};
	});
</script>

{#if props.busy && waited}
	<div
		class="bg-surface-50-950 border-surface-200-800 rounded-container text-muted absolute top-15 left-1/2 z-20 flex h-9 -translate-x-1/2 items-center gap-2 border px-3 text-xs shadow-lg"
		role="status"
	>
		<LoaderCircle class="size-3.5 shrink-0 animate-spin" />
		<span class="cap-center"
			>{waited > 1
				? m.figure_notice_drawing_long({ engine: props.engineName })
				: m.figure_notice_drawing({ engine: props.engineName })}</span
		>
	</div>
{/if}
