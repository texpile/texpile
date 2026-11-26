<script lang="ts">
	import { Sparkles } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { tip } from '$lib/components/tooltip.svelte';
	import { openPreferencesAt } from '$lib/stores/dialogStore';
</script>

<button
	class="btn-icon btn-icon-sm hover:preset-tonal"
	onclick={() => openPreferencesAt('ai')}
	use:tip={m.problems_proofread_hint()}
	aria-label={m.problems_proofread_hint()}
>
	<Sparkles class="size-4" />
</button>
