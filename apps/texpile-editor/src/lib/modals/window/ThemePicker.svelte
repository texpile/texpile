<script lang="ts">
	// The theme grid in Preferences: a tile per built-in theme, drawn as a miniature window in the
	// theme's own colours for the mode we are in; a theme's stylesheet loads only once it is chosen.
	import ThemeTileButton from './appearance/ThemeTileButton.svelte';
	import PrefsRow from './rows/PrefsRow.svelte';
	import { themeName } from '$lib/theme';
	import { loadPresetThemes, type ThemeTileInfo } from '$lib/customThemes/presetThemes';

	let tiles = $state<ThemeTileInfo[]>([]);
	$effect(() => {
		void loadPresetThemes().then((list) => (tiles = list));
	});
	const current = $derived(tiles.find((t) => t.name === themeName.current)?.label ?? '');
</script>

<PrefsRow id="appearance-theme" layout="block">
	{#snippet children(def)}
		<div class="flex items-start justify-between gap-6">
			<div class="text-sm font-medium">{def.label()}</div>
			<span class="text-muted shrink-0 text-sm">{current}</span>
		</div>
		<div class="mt-3 flex flex-wrap gap-2.5">
			{#each tiles as t (t.name)}
				<ThemeTileButton theme={t} />
			{/each}
		</div>
	{/snippet}
</PrefsRow>
