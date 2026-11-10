<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { toolchainProbe } from '../toolchainProbe.svelte';
	import { toolDirs } from '../toolDirs.svelte';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import { problemText, programWithVersion } from './toolchainRows';
	import { m } from '$lib/paraglide/messages';

	if (!toolchainProbe.checked && !toolchainProbe.probing) void toolchainProbe.run();
	const probe = $derived(toolchainProbe.probeFor('git'));
</script>

<PrefsRow id="git-program">
	{#snippet below()}
		{#if probe && !probe.found}
			<a class="anchor text-xs" href="https://texpile.com/docs/installation/git" target="_blank" rel="noopener noreferrer"
				>{m.vcs_git_install()}</a
			>
		{/if}
	{/snippet}
	{#if !probe}
		<span class="text-faint text-sm">{m.prefs_toolchain_checking()}</span>
	{:else if !probe.found}
		<div class="flex items-center gap-3">
			<span class="text-faint text-sm">{m.prefs_toolchain_missing()}</span>
			<button type="button" class="btn btn-sm preset-tonal" onclick={() => void toolDirs.locate('git')} disabled={toolDirs.busy}>
				{m.prefs_toolchain_locate()}
			</button>
		</div>
	{:else if probe.broken}
		<div class="flex items-center gap-3">
			<span class="text-warning-ink text-sm" use:tip={probe.detail}>{problemText(probe)}</span>
			<button type="button" class="btn btn-sm preset-tonal" onclick={() => void toolchainProbe.run()} disabled={toolchainProbe.probing}>
				{m.prefs_toolchain_recheck()}
			</button>
		</div>
	{:else}
		<span class="text-muted flex items-center gap-1.5 text-sm" use:tip={probe.path}>
			<Check class="text-success-ink size-4 shrink-0" />
			<span class="cap-center font-mono">{programWithVersion('git', probe.detail)}</span>
		</span>
	{/if}
</PrefsRow>
