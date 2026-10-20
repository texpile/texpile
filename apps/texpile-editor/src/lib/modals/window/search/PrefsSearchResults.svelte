<script lang="ts">
	import type { PrefsNavigation } from './prefsNavigation.svelte';
	import { m } from '$lib/paraglide/messages';

	const props: { navigation: PrefsNavigation } = $props();
</script>

{#each props.navigation.groups as group (group.tab)}
	<section data-prefs-group={group.tab}>
		<h3 class="pt-4 pb-1 text-sm font-semibold">{group.title}</h3>
		{#each group.sections as section (section.id ?? '')}
			{#if section.heading}
				<h4 class="text-muted pt-2 pb-1 text-xs font-semibold tracking-wide uppercase">{section.heading}</h4>
			{/if}
			{#each section.rows as row (row.id)}
				<button
					type="button"
					class="rounded-base hover:preset-tonal block w-full px-2 py-2 text-left"
					onclick={() => void props.navigation.reveal(row)}
				>
					<span class="block text-sm font-medium">{row.label()}</span>
					{#if row.note?.()}<span class="text-muted mt-0.5 line-clamp-2 block text-xs leading-relaxed">{row.note()}</span>{/if}
				</button>
			{/each}
		{/each}
	</section>
{:else}
	<p class="text-muted py-10 text-center text-sm">{m.prefs_search_no_results()}</p>
{/each}
