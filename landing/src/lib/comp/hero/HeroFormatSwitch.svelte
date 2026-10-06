<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { HERO_SETS, type HeroFormat } from './heroScenes';

	type HeroFormatSwitchProps = { formats: HeroFormat[]; current: HeroFormat; onpick: (format: HeroFormat) => void };
	const props: HeroFormatSwitchProps = $props();
	const { formats, current, onpick } = $derived(props);
</script>

<div role="group" aria-label={m.hero_scenes_format()} class="rounded-base inline-flex bg-white/10 p-0.5">
	{#each formats as format (format)}
		<button
			type="button"
			aria-pressed={format === current}
			onclick={() => onpick(format)}
			class="rounded-base focus-visible:outline-primary-500 px-4 py-1 text-sm font-semibold outline-none focus-visible:outline-2 {format ===
			current
				? 'bg-white/15 text-white'
				: 'text-surface-400 hover:text-white'}"
		>
			{HERO_SETS[format].label}
		</button>
	{/each}
</div>
