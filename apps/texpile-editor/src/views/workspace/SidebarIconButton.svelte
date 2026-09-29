<script lang="ts">
	// One of the sidebar header's icons. `active` is the view it toggles being the one showing;
	// `count` is drawn on the icon, as VS Code badges Source Control's with its changed files.
	import { tip } from '$lib/components/tooltip.svelte';
	import type { FilePlus } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = { icon: typeof FilePlus; label: string; title?: string; active?: boolean; count?: number; onclick: () => void };
	let { icon: Icon, label, title, active = false, count = 0, onclick }: Props = $props();

	const counted = $derived(count === 1 ? m.vcs_badge_changes_one() : count ? m.vcs_badge_changes({ count }) : '');
</script>

<button
	class="btn-icon btn-icon-xs relative {active ? 'text-primary-ink' : 'hover:preset-tonal'}"
	use:tip={counted ? `${title ?? label} · ${counted}` : (title ?? label)}
	aria-label={counted ? `${label}, ${counted}` : label}
	{onclick}
>
	<Icon class="size-4" />
	{#if count}
		<span
			class="bg-primary-500 text-primary-contrast-500 pointer-events-none absolute -top-1 -right-1 min-w-3.5 rounded-full px-0.5 text-center text-[9px] leading-3.5 font-semibold tabular-nums"
			aria-hidden="true">{count > 99 ? '99+' : count}</span
		>
	{/if}
</button>
