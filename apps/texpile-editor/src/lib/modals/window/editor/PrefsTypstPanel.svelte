<script lang="ts">
	import { settings, updateSettings } from '$lib/settings';
	import PrefsSwitchRow from '../rows/PrefsSwitchRow.svelte';
</script>

<PrefsSwitchRow
	id="typst-preview-follow"
	checked={settings.current.typstPreviewFollow === true}
	onChange={(v) => updateSettings({ typstPreviewFollow: v })}
/>
