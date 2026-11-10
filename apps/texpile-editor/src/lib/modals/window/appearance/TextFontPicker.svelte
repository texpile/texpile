<script lang="ts">
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { ChevronDown } from '@lucide/svelte';
	import { settings, updateSettings } from '$lib/settings';
	import { nativeBridge } from '$lib/workspace/fileSystem';
	import { textFontValue, themeFontName } from '$lib/chrome/editorTextFont';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import { m } from '$lib/paraglide/messages';

	let open = $state(false);
	let query = $state('');
	let fonts = $state<string[] | null>(null);
	function readThemeFont(): string {
		return themeFontName(getComputedStyle(document.documentElement).getPropertyValue('--typo-base--font-family'));
	}
	let themeFont = $state(readThemeFont());

	const chosen = $derived(settings.current.textFont);
	const defaultLabel = $derived(themeFont ? m.prefs_text_font_theme({ font: themeFont }) : m.prefs_text_font_system());
	const shown = $derived((fonts ?? []).filter((f) => f.toLowerCase().includes(query.trim().toLowerCase())));

	function onOpenChange(e: { open: boolean }) {
		open = e.open;
		if (!e.open) return;
		query = '';
		themeFont = readThemeFont();
		void nativeBridge()
			?.installedFonts?.()
			.then((list) => (fonts = list))
			.catch(() => (fonts = []));
	}

	function pick(family: string) {
		open = false;
		updateSettings({ textFont: family });
	}
</script>

<PrefsRow id="text-font">
	<Popover {open} {onOpenChange} positioning={{ placement: 'bottom-end' }}>
		<Popover.Trigger>
			<button
				type="button"
				class="btn btn-sm preset-tonal min-w-48 justify-between"
				style:font-family={chosen ? textFontValue(chosen) : undefined}
			>
				<span class="cap-center truncate">{chosen || defaultLabel}</span>
				<ChevronDown class="size-4 shrink-0" />
			</button>
		</Popover.Trigger>
		<Portal>
			<Popover.Positioner class="z-context-menu">
				<Popover.Content class="card bg-surface-50-950 border-surface-300-700 w-72 border p-2 shadow-lg">
					<input class="input mb-2 text-sm" type="search" placeholder={m.prefs_text_font_search()} bind:value={query} />
					<div class="max-h-64 overflow-y-auto">
						<button type="button" class="hover:preset-tonal rounded-base w-full px-2 py-1.5 text-left text-sm" onclick={() => pick('')}>
							{defaultLabel}
						</button>
						{#each shown as family (family)}
							<button
								type="button"
								class="hover:preset-tonal rounded-base w-full truncate px-2 py-1.5 text-left text-sm"
								class:preset-tonal-primary={family === chosen}
								style:font-family={textFontValue(family)}
								onclick={() => pick(family)}
							>
								{family}
							</button>
						{/each}
						{#if fonts === null}
							<p class="text-muted px-2 py-1.5 text-sm">{m.prefs_text_font_loading()}</p>
						{:else if shown.length === 0}
							<p class="text-muted px-2 py-1.5 text-sm">{m.prefs_text_font_none()}</p>
						{/if}
					</div>
				</Popover.Content>
			</Popover.Positioner>
		</Portal>
	</Popover>
</PrefsRow>
