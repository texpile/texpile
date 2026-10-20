<script lang="ts">
	// completion and the LaTeX checks, for every folder and then for the open one
	import { settings, updateSettings } from '$lib/settings';
	import { appCheckIsOn, LATEX_CHECK_IDS, setLatexCheck } from '$lib/languages/latex/intellisense/checks/checkSwitches';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { latexCheckRowId } from '../search/prefsRows';
	import PrefsHeading from '../rows/PrefsHeading.svelte';
	import PrefsSwitchRow from '../rows/PrefsSwitchRow.svelte';
	import PrefsFolderChecks from './PrefsFolderChecks.svelte';
	import PrefsPackageFiles from '../packages/PrefsPackageFiles.svelte';
</script>

<PrefsHeading section="completion" />
<div class="pl-4">
	<PrefsSwitchRow
		id="completion-by-mode"
		checked={settings.current.completionByMode !== false}
		onChange={(on) => updateSettings({ completionByMode: on })}
	/>
	<PrefsSwitchRow
		id="argument-hints"
		checked={settings.current.argumentHints !== false}
		onChange={(on) => updateSettings({ argumentHints: on })}
	/>
	<PrefsPackageFiles />
</div>
<PrefsHeading section="checks" />
<div class="pl-4">
	{#each LATEX_CHECK_IDS as id (id)}
		<PrefsSwitchRow id={latexCheckRowId(id)} checked={appCheckIsOn(id)} onChange={(on) => setLatexCheck(id, on)} />
	{/each}
</div>
{#if workspaceRoot.current}
	<PrefsHeading section="folderChecks" />
	<div class="pl-4">
		<PrefsFolderChecks />
	</div>
{/if}
