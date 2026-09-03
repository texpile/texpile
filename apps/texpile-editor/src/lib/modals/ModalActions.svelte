<script lang="ts">
	// The one action row under a dialog. A modal declares its buttons; this orders them for the
	// platform (dialogButtons.ts) and draws them, so no modal decides where Cancel sits.
	import { Loader2 } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { isWindows } from '$lib/platform';
	import { orderButtons, type DialogButton } from './dialogButtons';

	let {
		buttons,
		size = 'md',
		class: extra = ''
	}: {
		buttons: DialogButton[];
		size?: 'xs' | 'md';
		/** spacing against the content above; the row itself is unspaced */
		class?: string;
	} = $props();

	const ordered = $derived(orderButtons(buttons, isWindows ? 'windows' : 'mac'));

	function classes(b: DialogButton): string {
		// a caller's own preset (a tonal fill, say) replaces the default look rather than fighting it
		const look = b.class?.includes('preset-')
			? ''
			: b.role === 'primary'
				? b.danger
					? 'preset-tonal-error'
					: 'preset-filled-primary-500'
				: 'hover:preset-tonal';
		return ['btn', size === 'xs' ? 'btn-xs' : '', look, b.icon || b.busy ? 'gap-1.5' : '', b.class ?? ''].filter(Boolean).join(' ');
	}
</script>

<div class="flex justify-end gap-2 {extra}">
	{#each ordered as b (b.label)}
		{#if b.href}
			<a class={classes(b)} href={b.href} target="_blank" rel="noopener noreferrer">
				{#if b.icon}{@const Icon = b.icon}<Icon class="size-4" />{/if}
				{b.label}
			</a>
		{:else}
			<button class={classes(b)} type="button" disabled={b.disabled || b.busy} onclick={b.onclick} use:tip={b.tip}>
				{#if b.busy}
					<Loader2 class="size-4 animate-spin" />
				{:else if b.icon}
					{@const Icon = b.icon}
					<Icon class="size-4" />
				{/if}
				{b.label}
			</button>
		{/if}
	{/each}
</div>
