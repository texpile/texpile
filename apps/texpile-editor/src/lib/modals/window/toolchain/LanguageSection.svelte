<script lang="ts">
	import DistroPicker from './DistroPicker.svelte';
	import ManagedRow from './ManagedRow.svelte';
	import ProgramStatus from './ProgramStatus.svelte';
	import type { LanguageInstall } from './languageInstalls';
	import type { ProgramRow } from './toolchainRows';

	const props: { heading: string; pickLabel: string; install: LanguageInstall; rows: ProgramRow[] } = $props();
	const install = $derived(props.install);
	const Progress = $derived(install.progress);
</script>

<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{props.heading}</h3>
<DistroPicker
	family={install.family}
	label={props.pickLabel}
	offer={install.offer}
	guide={install.guide}
	onInstall={() => install.install()}
/>
<div class="flex items-end gap-3">
	<div class="min-w-0 flex-1 pb-1"><Progress /></div>
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
<ProgramStatus rows={props.rows} />
<ManagedRow {install} />
