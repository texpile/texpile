<script lang="ts">
	// Texpile's own TeX Live: install it when no TeX is found, remove the one it put there
	import { tip } from '$lib/components/tooltip.svelte';
	import { toolchainProbe } from '../toolchainProbe.svelte';
	import { texLiveInstaller } from './texLiveInstall.svelte';
	import { texLiveInstalledText } from './texLiveInstallText';
	import TexLiveInstallProgress from './TexLiveInstallProgress.svelte';
	import { m } from '$lib/paraglide/messages';

	const installer = texLiveInstaller;
	void installer.refresh();

	const status = $derived(installer.status);
	const installed = $derived(status?.installed ?? null);
	// with a TeX of the writer's own there is nothing to offer: a TeX on PATH comes first
	const missing = $derived(toolchainProbe.checked && !toolchainProbe.probing && !toolchainProbe.distros.some((d) => d.family === 'latex'));
	const shown = $derived(installer.offered && (!!installed || missing || installer.busy || !!installer.failure));
</script>

{#if shown && status}
	<div class="border-surface-200-800 flex items-start justify-between gap-6 border-b py-4">
		<div class="min-w-0 flex-1">
			<div class="text-sm font-medium">{m.prefs_texlive_managed()}</div>
			<p class="text-muted mt-1 text-xs leading-relaxed">
				{#if !installed}
					{m.prefs_texlive_managed_none({ year: String(status.year), size: String(status.megabytes) })}
				{:else if installed.detail}
					<span use:tip={installed.bin}>{texLiveInstalledText(installed.detail, status.year)}</span>
				{:else}
					{m.prefs_texlive_managed_broken()}
				{/if}
			</p>
			<TexLiveInstallProgress />
		</div>
		<div class="flex shrink-0 gap-2">
			{#if installer.step}
				<!-- only the download can stop; checking and unpacking finish -->
				<button
					type="button"
					class="btn preset-tonal text-xs"
					onclick={() => installer.cancel()}
					disabled={installer.step.phase !== 'download'}>{m.texlive_install_cancel()}</button
				>
			{:else if installed}
				<button type="button" class="btn preset-tonal text-xs" onclick={() => void installer.remove()} disabled={installer.busy}>
					{m.texlive_remove()}
				</button>
			{:else}
				<button type="button" class="btn preset-tonal text-xs" onclick={() => void installer.install()} disabled={installer.busy}>
					{m.texlive_install()}
				</button>
			{/if}
		</div>
	</div>
{/if}
