<script lang="ts">
	import { FolderOpen } from '@lucide/svelte';
	import ThemeTileButton from './ThemeTileButton.svelte';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import { loadPresetThemes } from '$lib/customThemes/presetThemes';
	import {
		customThemes,
		customThemesAvailable,
		loadCustomThemes,
		onCustomThemesChanged,
		openThemesFolder
	} from '$lib/customThemes/customThemes.svelte';
	import { m } from '$lib/paraglide/messages';

	const why = customThemesAvailable() ? undefined : m.unavailable_desktop();

	// a tile shows what its theme sets over the default
	$effect(() => {
		let stop: (() => void) | null = null;
		void loadPresetThemes().then((presets) => {
			const base = presets[0]?.swatch;
			if (!base) return;
			void loadCustomThemes(base);
			stop = onCustomThemesChanged(() => void loadCustomThemes(base));
		});
		return () => stop?.();
	});
</script>

<PrefsRow id="custom-themes" {why}>
	<button type="button" class="btn btn-sm preset-tonal" disabled={!!why} onclick={openThemesFolder}>
		<FolderOpen class="size-4" />
		<span class="cap-center">{m.prefs_theme_open_folder()}</span>
	</button>
	{#snippet below()}
		{#if customThemes.tiles.length}
			<div class="mt-3 flex flex-wrap gap-2.5">
				{#each customThemes.tiles as t (t.name)}
					<ThemeTileButton theme={t} />
				{/each}
			</div>
		{/if}
	{/snippet}
</PrefsRow>
