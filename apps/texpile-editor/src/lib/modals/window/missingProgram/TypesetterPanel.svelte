<script lang="ts">
	// Whether this computer can build what the reader writes: one row a typesetter, an install where Texpile can do it
	import { CircleAlert, CircleCheck, LoaderCircle, X } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { toolchainProbe } from '../toolchainProbe.svelte';
	import { toolDirs } from '../toolDirs.svelte';
	import { tinymistInstaller } from '../tinymistInstall.svelte';
	import TinymistInstallProgress from '../TinymistInstallProgress.svelte';
	import { engineRows, type Typesetters } from './typesetterStatus.svelte';
	import { m } from '$lib/paraglide/messages';

	/** program: the one that was missing, which the LaTeX row is about rather than any engine */
	let { want, program }: { want: Typesetters; program?: string } = $props();

	// the probe and the folder list are refreshed by the dialog around it, which waits on what the probe finds
	void tinymistInstaller.refresh();

	async function addFolder(): Promise<void> {
		await toolDirs.browse();
		await toolDirs.add();
	}

	const engines = $derived(engineRows(want, program));
</script>

<!-- each row says its state the way Preferences › Toolchain does, in words and a colored icon, on two
     lines so every row is the same height; a button stands at the right only where there is one to press -->
<div class="border-surface-200-800 divide-surface-200-800 rounded-container divide-y border">
	{#each engines as e (e.kind)}
		<!-- Typst is the one typesetter Texpile can fetch for the reader: one program, no installer of its own -->
		{@const installable = e.kind === 'Typst' && !e.found && tinymistInstaller.offered}
		{@const checking = toolchainProbe.probing && !e.found}
		<div class="flex min-h-16 items-center gap-3 px-4 py-3">
			{#if checking}
				<LoaderCircle class="text-muted size-4 shrink-0 animate-spin" />
			{:else if e.found}
				<CircleCheck class="text-success-ink size-4 shrink-0" />
			{:else}
				<CircleAlert class="text-warning-ink size-4 shrink-0" />
			{/if}
			<div class="min-w-0 flex-1">
				<div class="text-sm font-medium">{e.kind}</div>
				<div class="text-muted truncate text-xs">
					{#if checking}
						{m.prefs_toolchain_checking()}
					{:else if e.found}
						{e.detail || m.typesetter_found()}
					{:else}
						{m.prefs_toolchain_missing()}
					{/if}
				</div>
				{#if installable}
					<TinymistInstallProgress />
				{/if}
			</div>
			{#if installable && !checking}
				{#if tinymistInstaller.step}
					<button
						type="button"
						class="btn preset-tonal shrink-0 text-xs"
						onclick={() => tinymistInstaller.cancel()}
						disabled={tinymistInstaller.step.phase !== 'download'}
					>
						{m.tinymist_install_cancel()}
					</button>
				{:else}
					<button
						type="button"
						class="btn preset-tonal shrink-0 text-xs"
						onclick={() => void tinymistInstaller.install()}
						disabled={tinymistInstaller.busy}
					>
						{m.tinymist_install()}
					</button>
				{/if}
			{/if}
		</div>
	{/each}
</div>

{#if toolDirs.rows.length}
	<div class="mt-3">
		{#each toolDirs.rows as row (row.entry)}
			<div class="border-surface-200-800 flex items-center gap-3 border-b py-1.5">
				<span class="min-w-0 flex-1 truncate font-mono text-xs" use:tip={row.absolute}>{row.entry}</span>
				{#if !row.exists}
					<span class="text-warning-ink shrink-0 text-xs">{m.prefs_toolchain_dir_missing()}</span>
				{/if}
				<button
					type="button"
					class="btn-icon btn-icon-xs hover:preset-tonal opacity-60 hover:opacity-100"
					aria-label={m.prefs_toolchain_dirs_remove()}
					use:tip={m.prefs_toolchain_dirs_remove()}
					onclick={() => void toolDirs.remove(row.entry)}
					disabled={toolDirs.busy}
				>
					<X class="size-4" />
				</button>
			</div>
		{/each}
	</div>
{/if}

<!-- the ways on, as one line of links; Preferences and checking again are in the dialog's own row -->
<div class="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
	<a class="anchor" href="https://texpile.com/docs/installation" target="_blank" rel="noopener noreferrer">
		{m.typesetter_how_to_install()}
	</a>
	<button type="button" class="anchor" onclick={() => void addFolder()} disabled={toolDirs.busy}>{m.typesetter_add_folder()}</button>
</div>
