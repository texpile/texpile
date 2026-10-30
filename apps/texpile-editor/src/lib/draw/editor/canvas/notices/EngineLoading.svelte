<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';

	type Props = { engineName: string };
	const props: Props = $props();

	// the first start after installing an engine builds its font database or fetches packages; say so once the wait is long
	let slow = $state(false);
	$effect(() => {
		const timer = setTimeout(() => (slow = true), 5000);
		return () => clearTimeout(timer);
	});
</script>

<!-- the engine reports no share of its start, so the bar runs until the first drawing -->
<Progress value={null} class="w-56 items-center gap-2">
	<Progress.Label class="text-xs">Loading {props.engineName}</Progress.Label>
	<!-- in the primary color Texpile's own progress bars wear -->
	<Progress.Track><Progress.Range class="bg-primary-500" /></Progress.Track>
</Progress>
{#if slow}<span class="text-xs">The first start after installing {props.engineName} can take a few minutes.</span>{/if}
