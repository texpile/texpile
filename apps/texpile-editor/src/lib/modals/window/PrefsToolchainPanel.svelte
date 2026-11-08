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
	// looked at again each time the page opens, for a program installed since
	if (!probe.probing) void probe.run();

	function rowsOf(group: ToolGroup): ProgramRow[] {
		if (probe.probeFailed) return [];
		return toolsInGroup(group).map((tool) => ({
			tool,
			probe: tool.id === 'tinymist' ? tinymistProbe(probe.tinymist) : probe.probeFor(tool.id)
		}));
	}
</script>

{#if probe.probeFailed}
	<p class="text-warning-ink pt-1 text-xs">{m.prefs_toolchain_probe_failed()}</p>
{/if}

<LanguageSection heading={m.prefs_group_latex()} pickLabel={m.prefs_toolchain_pick_tex()} install={texLiveInstall} rows={rowsOf('latex')} />
<LanguageSection heading={m.prefs_group_typst()} pickLabel={m.prefs_group_typst()} install={tinymistInstall} rows={rowsOf('typst')} />
<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{m.prefs_group_vcs()}</h3>
<ProgramStatus rows={rowsOf('general')} />
<OtherFolders />
