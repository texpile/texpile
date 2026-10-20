<script lang="ts">
	import { sectionLabel, type PrefsSectionId } from '../search/prefsRows';

	const props: { section: PrefsSectionId } = $props();
</script>

<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase" data-prefs-section={props.section}>
	{sectionLabel(props.section)}
</h3>
