<script lang="ts">
	// Where the agent is asked for something, and when
	import { openPreferencesAt } from '$lib/stores/dialogStore';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import McpServerRows from './McpServerRows.svelte';
	import { m } from '$lib/paraglide/messages';
</script>

<PrefsRow id="ai-use-proofread">
	<button class="btn btn-sm preset-tonal" onclick={() => openPreferencesAt('proofing')}>{m.prefs_ai_use_open()}</button>
</PrefsRow>
<PrefsRow id="ai-use-refine">
	<span class="text-muted text-xs">{m.prefs_ai_use_always_on_demand()}</span>
</PrefsRow>
<PrefsRow id="ai-use-document">
	<span class="text-muted text-xs">{m.prefs_ai_use_on_demand()}</span>
</PrefsRow>
<McpServerRows />
