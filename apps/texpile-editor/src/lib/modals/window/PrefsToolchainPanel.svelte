<script lang="ts">
	// eslint-disable-next-line no-restricted-imports -- only the catalog's names/groups; probing gates on the desktop bridge at runtime
	import { toolsInGroup, type ToolGroup } from '$lib/workspace/toolchainCatalog';
	import { toolchainProbe } from './toolchainProbe.svelte';
	import { toolDirs } from './toolDirs.svelte';
	import LanguageSection from './toolchain/LanguageSection.svelte';
	import ProgramStatus from './toolchain/ProgramStatus.svelte';
	import OtherFolders from './toolchain/OtherFolders.svelte';
	import { texLiveInstall, tinymistInstall } from './toolchain/languageInstalls';
	import { tinymistProbe, type ProgramRow } from './toolchain/toolchainRows';
	import { m } from '$lib/paraglide/messages';

	const probe = toolchainProbe;
	void toolDirs.refresh();
	texLiveInstall.refresh();
	tinymistInstall.refresh();
	// probed on first view, not on dialog mount: it spawns ten processes, and most users never open this category
	if (probe.tinymist === 'unchecked' && !probe.probing) void probe.run();

	function rowsOf(group: ToolGroup): ProgramRow[] {
		if (probe.probeFailed) return [];
		return toolsInGroup(group).map((tool) => ({
			tool,
			probe: tool.id === 'tinymist' ? tinymistProbe(probe.tinymist) : probe.probeFor(tool.id)
		}));
	}
</script>

<div class="border-surface-200-800 flex items-center justify-between gap-3 border-b pt-1 pb-3">
	<!-- always shown, so there is one place to go when a program is missing -->
	<a class="anchor text-xs" href="https://texpile.com/docs/installation" target="_blank" rel="noopener noreferrer"
		>{m.prefs_toolchain_install_guide()}</a
	>
	<button class="btn preset-tonal shrink-0 text-xs" onclick={() => void probe.run()} disabled={probe.probing}>
		{probe.probing ? m.prefs_toolchain_checking() : m.prefs_toolchain_recheck()}
	</button>
</div>
{#if probe.probeFailed}
	<p class="text-warning-ink pt-3 text-xs">{m.prefs_toolchain_probe_failed()}</p>
{/if}

<LanguageSection heading={m.prefs_group_latex()} pickLabel={m.prefs_toolchain_pick_tex()} install={texLiveInstall} rows={rowsOf('latex')} />
<LanguageSection heading={m.prefs_group_typst()} pickLabel={m.prefs_group_typst()} install={tinymistInstall} rows={rowsOf('typst')} />
<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{m.prefs_group_vcs()}</h3>
<ProgramStatus rows={rowsOf('general')} />
<OtherFolders />
