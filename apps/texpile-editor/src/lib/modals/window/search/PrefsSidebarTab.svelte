<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';
	import { unavailableTip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		label: string;
		/** the page is shown */
		current: boolean;
		/** the page is shown above its first heading */
		active: boolean;
		/** undefined for a page without headings */
		expanded?: boolean;
		unavailable?: boolean;
		matches?: number;
		dimmed?: boolean;
		onclick: () => void;
		ontoggle: () => void;
	};
	const props: Props = $props();
</script>

{#if props.unavailable}
	<!-- aria-disabled, not disabled: a disabled button takes no hover, and the hover is what says why -->
	<button
		class="rounded-base flex w-full cursor-default items-center gap-1 py-1 pr-3 pl-1.5 text-left text-sm opacity-50"
		aria-disabled="true"
		use:unavailableTip={m.unavailable_desktop()}
	>
		<span class="size-3.5 shrink-0"></span>
		<span class="cap-center min-w-0 truncate">{props.label}</span>
	</button>
{:else}
	<button
		class="rounded-base flex w-full items-center gap-1 py-1 pr-3 pl-1.5 text-left text-sm {props.active
			? 'bg-primary-tint font-medium'
			: 'hover:preset-tonal'} {props.dimmed ? 'opacity-50' : ''}"
		aria-current={props.current ? 'page' : undefined}
		aria-expanded={props.expanded}
		onclick={props.onclick}
	>
		{#if props.expanded === undefined}
			<span class="size-3.5 shrink-0"></span>
		{:else}
			<!-- the chevron opens and closes the list without leaving the page; the row's own click opens it too -->
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<span
				class="text-muted -m-1 shrink-0 p-1"
				onclick={(e) => {
					e.stopPropagation();
					props.ontoggle();
				}}
			>
				<ChevronRight class="size-3.5 {props.expanded ? 'rotate-90' : ''}" />
			</span>
		{/if}
		<span class="cap-center min-w-0 flex-1 truncate">{props.label}</span>
		{#if props.matches}
			<span class="bg-primary-500 text-primary-contrast-500 rounded-full px-1.5 text-xs tabular-nums">{props.matches}</span>
		{/if}
	</button>
{/if}
