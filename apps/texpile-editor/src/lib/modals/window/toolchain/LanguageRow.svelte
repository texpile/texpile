<script lang="ts">
	import { Download } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { toolDirs } from '../toolDirs.svelte';
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
	import { m } from '$lib/paraglide/messages';

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
			<DistroPicker
				family={install.family}
				offer={install.offer}
				locate={install.locate}
				busy={install.busy}
				onInstall={() => install.install()}
			/>
		{:else}
			<!-- nothing found: Texpile's own install, or one it does not know where to look for -->
			<div class="flex gap-2">
				<button
					type="button"
					class="btn preset-tonal text-sm"
					onclick={() => void toolDirs.locate(install.locate.program)}
					disabled={toolDirs.busy || install.busy}
				>
					{m.prefs_toolchain_locate()}
				</button>
				{#if install.offer}
					<button
						type="button"
						class="btn preset-filled-primary-500 text-sm"
						use:tip={install.offer.note ?? install.offer.label}
						onclick={() => install.install()}
						disabled={install.busy}
					>
						<Download class="size-4" />
						<span class="cap-center">{install.installLabel}</span>
					</button>
				{/if}
			</div>
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
