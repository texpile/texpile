<script lang="ts">
	// eslint-disable-next-line no-restricted-imports -- only the catalog's names/groups; probing gates on the desktop bridge at runtime
	import { toolsInGroup, type ToolGroup } from '$lib/workspace/toolchainCatalog';
	import { toolchainProbe } from './toolchainProbe.svelte';
	import { toolDirs } from './toolDirs.svelte';
	import LanguageRow from './toolchain/LanguageRow.svelte';
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

<LanguageRow id="compiler-latex" install={texLiveInstall} rows={rowsOf('latex')} />
<LanguageRow id="compiler-typst" install={tinymistInstall} rows={rowsOf('typst')} />
<OtherFolders />
