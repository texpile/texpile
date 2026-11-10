<script lang="ts">
	import { Minus, TriangleAlert } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { toolchainProbe } from '../toolchainProbe.svelte';
	import { problemText, type ProgramRow } from './toolchainRows';
	import { m } from '$lib/paraglide/messages';

	const props: { row: ProgramRow } = $props();
	const tool = $derived(props.row.tool);
	const probe = $derived(props.row.probe);
</script>

<div class="flex items-center gap-2 py-1.5" use:tip={tool.purpose}>
	<!-- a program that is not there is a fact, one that does not run is a problem -->
	{#if probe?.found}
		<TriangleAlert class="text-warning-ink size-4 shrink-0" />
	{:else}
		<Minus class="text-faint size-4 shrink-0" />
	{/if}
	<span class="cap-center w-28 shrink-0 font-mono text-sm font-medium">{tool.name}</span>
	<span
		class="cap-center min-w-0 flex-1 truncate text-sm {probe?.found ? 'text-warning-ink' : 'text-faint'}"
		use:tip={probe?.broken ? probe.detail : undefined}
	>
		{problemText(probe)}
	</span>
	{#if probe?.found}
		<button
			type="button"
			class="btn btn-sm preset-tonal shrink-0"
			onclick={() => void toolchainProbe.run()}
			disabled={toolchainProbe.probing}
		>
			{m.prefs_toolchain_recheck()}
		</button>
	{/if}
</div>
