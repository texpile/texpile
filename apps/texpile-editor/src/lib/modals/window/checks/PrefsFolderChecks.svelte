<script lang="ts">
	import { LATEX_CHECK_IDS } from '$lib/languages/latex/intellisense/checks/checkSwitches';
	import { checkName } from '$lib/languages/latex/intellisense/checks/checkTexts';
	import { folderCheckRowId } from '../search/prefsRows';
	import PrefsSelectRow from '../rows/PrefsSelectRow.svelte';
	import { chooseFolderCheck, folderCheckChoice, folderCheckOptions, folderChecksUnavailable } from './folderChecks';
	import { m } from '$lib/paraglide/messages';

	const why = $derived(folderChecksUnavailable());
</script>

<p class="text-muted pb-1 text-xs leading-relaxed">{m.prefs_checks_folder_note()}</p>
{#each LATEX_CHECK_IDS as id (id)}
	<PrefsSelectRow
		id={folderCheckRowId(id)}
		value={folderCheckChoice(id)}
		options={folderCheckOptions()}
		onChange={(choice) => chooseFolderCheck(id, choice)}
		{why}
		ariaLabel={`${checkName(id)} (${m.prefs_checks_this_folder()})`}
	/>
{/each}
