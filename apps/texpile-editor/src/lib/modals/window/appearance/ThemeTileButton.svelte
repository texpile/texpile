<script lang="ts">
	import { Check } from '@lucide/svelte';
	import ThemeTile from '../ThemeTile.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { resolvedMode, themeName, setThemeName } from '$lib/theme';
	import type { ThemeTileInfo } from '$lib/customThemes/presetThemes';

	type Props = { theme: ThemeTileInfo };
	const props: Props = $props();
	const { name, label, swatch: s } = $derived(props.theme);
	const active = $derived(themeName.current === name);
	const dark = $derived(resolvedMode.current === 'dark');
</script>

<div class="relative">
	<button
		type="button"
		class="border-surface-300-700 rounded-base relative block size-11 overflow-hidden border {active
			? 'ring-primary-500 ring-offset-surface-50-950 ring-2 ring-offset-2'
			: 'hover:ring-muted hover:ring-offset-surface-50-950 hover:ring-2 hover:ring-offset-2'}"
		aria-pressed={active}
		aria-label={label}
		use:tip={label}
		onclick={() => setThemeName(name)}
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
			class="bg-primary-500 text-primary-contrast-500 pointer-events-none absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full"
		>
			<Check class="size-3" />
		</span>
	{/if}
</div>
