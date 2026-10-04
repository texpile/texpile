<script lang="ts">
	// A repository's folder, as the gates in front of the panel show it: the end of a long path,
	// which is the part that names the folder - the start is the same few folders for every project
	// on the machine. The whole path is in the tip.
	import { tip } from '$lib/components/tooltip.svelte';

	let { path }: { path: string } = $props();

	const shown = $derived.by(() => {
		const parts = path.split(/[\\/]/).filter(Boolean);
		return path.length > 32 && parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : path;
	});
</script>

<p class="bg-surface-200-800 rounded-base max-w-full truncate px-2 py-0.5 font-mono text-xs" use:tip={path}>{shown}</p>
