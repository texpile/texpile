<script lang="ts">
	// The theme grid in Preferences: a tile per theme, drawn as a miniature window in the theme's
	// own colours for the mode we are in. Tiles come from /themes/index.json (written by
	// scripts/sync-themes.mjs); a theme's stylesheet loads only once it is chosen.
	import { Check } from '@lucide/svelte';
	import ThemeTile from './ThemeTile.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { resolvedMode, themeName, setThemeName } from '$lib/theme';
	import { m } from '$lib/paraglide/messages';

	type Swatch = {
		primary: string;
		surfaceLight: string;
		surfaceDark: string;
		panelLight: string;
		panelDark: string;
	};
	type Tile = { name: string; label: string; swatch: Swatch };

	let tiles = $state<Tile[]>([]);
	$effect(() => {
		fetch('/themes/index.json')
			.then((r) => (r.ok ? (r.json() as Promise<Tile[]>) : []))
			.then((list) => (tiles = list))
			.catch(() => {});
	});
	const current = $derived(tiles.find((t) => t.name === themeName.current)?.label ?? '');
	const dark = $derived(resolvedMode.current === 'dark');
</script>

<div class="border-surface-200-800 border-b py-4 last:border-b-0">
	<div class="flex items-start justify-between gap-6">
		<div class="text-sm font-medium">{m.prefs_theme()}</div>
		<span class="text-muted shrink-0 text-sm">{current}</span>
	</div>
	<div class="mt-3 flex flex-wrap gap-2.5">
		{#each tiles as t (t.name)}
			{@const active = themeName.current === t.name}
			{@const s = t.swatch}
			<div class="relative">
				<button
					type="button"
					class="border-surface-300-700 relative block size-11 overflow-hidden rounded-base border {active
						? 'ring-primary-500 ring-offset-surface-50-950 ring-2 ring-offset-2'
						: 'hover:ring-muted hover:ring-offset-surface-50-950 hover:ring-2 hover:ring-offset-2'}"
					aria-pressed={active}
					use:tip={t.label}
					onclick={() => setThemeName(t.name)}
				>
					<ThemeTile
						ground={dark ? s.surfaceDark : s.surfaceLight}
						panel={dark ? s.panelDark : s.panelLight}
						text={dark ? s.surfaceLight : s.surfaceDark}
						accent={s.primary}
						class="absolute inset-0"
					/>
				</button>
				{#if active}
					<span
						class="bg-primary-500 pointer-events-none absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full text-white"
					>
						<Check class="size-3" />
					</span>
				{/if}
			</div>
		{/each}
	</div>
</div>
