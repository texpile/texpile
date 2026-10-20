<script lang="ts">
	import { settings, updateSettings } from '$lib/settings';
	import PrefsSwitchRow from '../rows/PrefsSwitchRow.svelte';
</script>

<PrefsSwitchRow
	id="reopen-last-folder"
	checked={settings.current.reopenLastFolder}
	onChange={(v) => updateSettings({ reopenLastFolder: v })}
/>
<PrefsSwitchRow id="check-updates" checked={settings.current.checkForUpdates} onChange={(v) => updateSettings({ checkForUpdates: v })} />
