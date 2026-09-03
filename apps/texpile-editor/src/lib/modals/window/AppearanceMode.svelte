<script lang="ts">
	// Light / System / Dark as tiles: each a miniature window in the current theme, System split
	// diagonally between its light and dark sides.
	import { Check } from '@lucide/svelte';
	import ThemeTile from './ThemeTile.svelte';
	import { themeChoice, setTheme, type ThemeChoice } from '$lib/theme';
	import { m } from '$lib/paraglide/messages';

	const LIGHT = {
		ground: 'var(--color-surface-50)',
		panel: 'var(--color-surface-200)',
		text: 'var(--color-surface-950)',
		accent: 'var(--color-primary-500)'
	};
	const DARK = {
		ground: 'var(--color-surface-950)',
		panel: 'var(--color-surface-800)',
		text: 'var(--color-surface-50)',
		accent: 'var(--color-primary-500)'
	};

	const options: { value: ThemeChoice; label: () => string }[] = [
		{ value: 'light', label: () => m.prefs_theme_light() },
		{ value: 'system', label: () => m.prefs_theme_system() },
		{ value: 'dark', label: () => m.prefs_theme_dark() }
	];
</script>

<div class="flex shrink-0 gap-3">
	{#each options as o (o.value)}
		{@const active = themeChoice.current === o.value}
		<button type="button" class="flex flex-col items-center gap-1.5" aria-pressed={active} onclick={() => setTheme(o.value)}>
			<span class="relative block">
				<span
					class="border-surface-300-700 relative block h-9 w-12 overflow-hidden rounded-base border {active
						? 'ring-primary-500 ring-offset-surface-50-950 ring-2 ring-offset-2'
						: 'hover:ring-muted hover:ring-offset-surface-50-950 hover:ring-2 hover:ring-offset-2'}"
				>
					{#if o.value === 'light'}
						<ThemeTile {...LIGHT} class="absolute inset-0" />
					{:else if o.value === 'dark'}
						<ThemeTile {...DARK} class="absolute inset-0" />
					{:else}
						<ThemeTile {...DARK} class="absolute inset-0" />
						<ThemeTile {...LIGHT} class="absolute inset-0 [clip-path:polygon(0_0,100%_0,0_100%)]" />
					{/if}
				</span>
				{#if active}
					<span
						class="bg-primary-500 pointer-events-none absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full text-white"
					>
						<Check class="size-3" />
					</span>
				{/if}
			</span>
			<span class="text-xs {active ? 'font-medium' : 'text-muted'}">{o.label()}</span>
		</button>
	{/each}
</div>
