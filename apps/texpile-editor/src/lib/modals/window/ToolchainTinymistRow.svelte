<script lang="ts">
	// Texpile's own tinymist: install it when none is found, reinstall or remove the one it put there
	import { tip } from '$lib/components/tooltip.svelte';
	import { tinymistInstaller } from './tinymistInstall.svelte';
	import { toolchainProbe } from './toolchainProbe.svelte';
	import TinymistInstallProgress from './TinymistInstallProgress.svelte';
	import { m } from '$lib/paraglide/messages';

	const installer = tinymistInstaller;
	void installer.refresh();

	const status = $derived(installer.status);
	const installed = $derived(status?.installed ?? null);
	const missing = $derived(toolchainProbe.tinymist === null && !toolchainProbe.probing);
	// with a tinymist of the user's own in use there is nothing to offer, unless ours is also there
	const shown = $derived(installer.offered && (!!installed || missing || installer.busy || !!installer.failure));
</script>

{#if shown && status}
	<div class="border-surface-200-800 flex items-start justify-between gap-6 border-b py-4">
		<div class="min-w-0 flex-1">
			<div class="text-sm font-medium">{m.prefs_tinymist_managed()}</div>
			<p class="text-muted mt-1 text-xs leading-relaxed">
				{#if !installed}
					{m.prefs_tinymist_managed_none({ version: status.pinned })}
				{:else if installed.version}
					<span use:tip={installed.command}>{m.prefs_tinymist_managed_installed({ version: installed.version })}</span>
				{:else}
					{m.prefs_tinymist_managed_broken()}
				{/if}
			</p>
			<TinymistInstallProgress />
		</div>
		<div class="flex shrink-0 gap-2">
			{#if installer.step}
				<!-- only the download can stop; checking and unpacking take a moment and finish -->
				<button
					type="button"
					class="btn preset-tonal text-xs"
					onclick={() => installer.cancel()}
					disabled={installer.step.phase !== 'download'}>{m.tinymist_install_cancel()}</button
				>
			{:else if installed}
				<button type="button" class="btn preset-tonal text-xs" onclick={() => void installer.install()} disabled={installer.busy}>
					{m.tinymist_reinstall()}
				</button>
				<button type="button" class="btn preset-tonal text-xs" onclick={() => void installer.remove()} disabled={installer.busy}>
					{m.tinymist_remove()}
				</button>
			{:else}
				<button type="button" class="btn preset-tonal text-xs" onclick={() => void installer.install()} disabled={installer.busy}>
					{m.tinymist_install()}
				</button>
			{/if}
		</div>
	</div>
{/if}
