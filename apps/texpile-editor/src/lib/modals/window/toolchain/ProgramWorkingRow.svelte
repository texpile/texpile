<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import type { ProgramRow } from './toolchainRows';

	const props: { row: ProgramRow } = $props();
</script>

<div class="flex min-w-0 items-center gap-2 py-1" use:tip={props.row.tool.purpose}>
	<Check class="text-success-ink size-4 shrink-0" />
	<span class="cap-center w-28 shrink-0 font-mono text-sm">{props.row.tool.name}</span>
	<span class="cap-center text-faint min-w-0 flex-1 truncate font-mono text-xs" use:tip={props.row.probe?.detail}>
		{props.row.probe?.detail ?? ''}
	</span>
</div>
