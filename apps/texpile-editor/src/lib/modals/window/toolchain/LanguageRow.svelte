<script lang="ts">
	import { Download } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { distros } from '../distros.svelte';
	import { toolchainProbe } from '../toolchainProbe.svelte';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import type { PrefsRowId } from '../search/prefsRows';
	import DistroPicker from './DistroPicker.svelte';
	import LanguageNote from './LanguageNote.svelte';
	import ManagedRow from './ManagedRow.svelte';
	import ProgramProblemRow from './ProgramProblemRow.svelte';
	import ProgramWorkingRow from './ProgramWorkingRow.svelte';
	import type { LanguageInstall } from './languageInstalls';
	import { languageNote, splitPrograms, type ProgramRow } from './toolchainRows';

	const props: { id: PrefsRowId; install: LanguageInstall; rows: ProgramRow[] } = $props();
	const install = $derived(props.install);
	const Progress = $derived(install.progress);
	const note = $derived(languageNote(props.rows, toolchainProbe.probing));
	const split = $derived(splitPrograms(props.rows));
	const picks = $derived(distros.list(install.family).length > 0);
	let open = $state(false);
</script>

<div class="border-surface-200-800 border-b py-4">
	<PrefsRow id={props.id} frame="none">
		{#snippet below()}
			<LanguageNote {note} docs={install.docs} {open} onToggle={() => (open = !open)} />
		{/snippet}
		{#if picks}
			<DistroPicker family={install.family} offer={install.offer} busy={install.busy} onInstall={() => install.install()} />
		{:else if install.offer}
			<button
				type="button"
				class="btn preset-tonal text-sm"
				use:tip={install.offer.note}
				onclick={() => install.install()}
				disabled={install.busy}
			>
				<Download class="size-4" />
				<span class="cap-center">{install.offer.label}</span>
			</button>
		{/if}
	</PrefsRow>
	<div class="flex items-end gap-3">
		<div class="min-w-0 flex-1"><Progress /></div>
		<!-- only the download can stop; checking and unpacking finish -->
		{#if install.step}
			<button
				type="button"
				class="btn btn-sm preset-tonal shrink-0"
				onclick={() => install.cancel()}
				disabled={install.step.phase !== 'download'}
			>
				{install.cancelLabel}
			</button>
		{/if}
	</div>
	{#if note?.kind === 'several'}
		<div class="pt-2">
			{#each split.problems as row (row.tool.id)}
				<ProgramProblemRow {row} />
			{/each}
			{#if open}
				{#each split.working as row (row.tool.id)}
					<ProgramWorkingRow {row} />
				{/each}
			{/if}
		</div>
	{/if}
	<ManagedRow {install} />
</div>
