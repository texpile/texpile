<script lang="ts">
	import { Search } from '@lucide/svelte';
	import type { PrefsNavigation } from './prefsNavigation.svelte';
	import { m } from '$lib/paraglide/messages';

	const props: { navigation: PrefsNavigation } = $props();
</script>

<div class="input mb-2 flex items-center gap-1.5 text-sm">
	<Search class="text-faint size-3.5 shrink-0" />
	<input
		bind:value={props.navigation.query}
		class="min-w-0 flex-1 bg-transparent outline-none"
		placeholder={m.prefs_search_placeholder()}
		aria-label={m.prefs_search_placeholder()}
		spellcheck="false"
		onkeydown={(e) => {
			if (e.key === 'Escape' && props.navigation.query) {
				e.stopPropagation();
				props.navigation.query = '';
			}
		}}
	/>
</div>
