<script lang="ts">
	// external apps Texpile talks to, as opposed to Toolchain's programs it runs. One on/off per integration
	import { settings, updateSettings } from '$lib/settings';
	import PrefsSwitchRow from '../rows/PrefsSwitchRow.svelte';
</script>

<PrefsSwitchRow
	id="zotero"
	checked={settings.current.zoteroEnabled !== false}
	onChange={(v) => updateSettings({ zoteroEnabled: v })}
	docs="https://texpile.com/docs/integrations/zotero"
/>
<PrefsSwitchRow
	id="cite-doi"
	checked={settings.current.citeByDoiEnabled !== false}
	onChange={(v) => updateSettings({ citeByDoiEnabled: v })}
/>
