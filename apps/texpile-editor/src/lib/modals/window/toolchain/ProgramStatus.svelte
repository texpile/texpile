<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { toolchainProbe } from '../toolchainProbe.svelte';
	import ProgramProblemRow from './ProgramProblemRow.svelte';
	import ProgramWorkingRow from './ProgramWorkingRow.svelte';
	import { programWithVersion, splitPrograms, type ProgramRow } from './toolchainRows';
	import { m } from '$lib/paraglide/messages';

	const props: { rows: ProgramRow[] } = $props();
	const split = $derived(splitPrograms(props.rows));
	const only = $derived(split.working.length === 1 ? split.working[0] : null);
	let open = $state(false);
</script>

{#each split.problems as row (row.tool.id)}
	<ProgramProblemRow {row} />
{/each}
{#if only}
	<div class="flex items-center gap-2 py-1.5" use:tip={only.tool.purpose}>
		<Check class="text-success-ink size-4 shrink-0" />
		<span class="cap-center min-w-0 flex-1 truncate text-sm" use:tip={only.probe?.detail}>
			{m.prefs_toolchain_program_works({ program: programWithVersion(only.tool.name, only.probe?.detail) })}
		</span>
	</div>
{:else if split.working.length}
	<div class="flex items-center gap-2 py-1.5">
		<Check class="text-success-ink size-4 shrink-0" />
		<span class="cap-center min-w-0 flex-1 text-sm">
			{split.problems.length
				? m.prefs_toolchain_more_programs_work({ count: String(split.working.length) })
				: m.prefs_toolchain_programs_work({ count: String(split.working.length) })}
		</span>
		<button type="button" class="btn btn-sm preset-tonal shrink-0" aria-expanded={open} onclick={() => (open = !open)}>
			{open ? m.prefs_toolchain_hide() : m.prefs_toolchain_show()}
		</button>
	</div>
	{#if open}
		{#each split.working as row (row.tool.id)}
			<div class="pl-6"><ProgramWorkingRow {row} /></div>
		{/each}
	{/if}
{/if}
{#if split.pending.length && toolchainProbe.probing}
	<p class="text-faint py-1.5 pl-6 text-sm">{m.prefs_toolchain_checking()}</p>
{/if}
