<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { Pencil } from '@lucide/svelte';
	import FigurePlaceholder from './FigurePlaceholder.svelte';
	import { tip, unavailableTip } from '$lib/components/tooltip.svelte';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { GUEST_ROOT } from '$lib/collab/sessionProvider';
	import type { PictureCrop } from './compiled/renderPictureCrop';

	type Props = {
		svg: string | null;
		compiled?: PictureCrop | null;
		title: string;
		summary: string;
		onedit: () => void;
	};
	const props: Props = $props();
	// the figure tab draws from the folder on disk, with the host's own engine
	const guest = $derived(workspaceRoot.current === GUEST_ROOT);
	const drawn = $derived(!!props.svg || !!props.compiled);
	const place = $derived(`absolute opacity-0 transition-opacity ${drawn ? 'top-0 left-full ml-2' : 'top-2 right-2'}`);
</script>

<div class="relative {drawn ? 'w-fit max-w-full' : 'w-full max-w-md'}">
	{#if props.svg}
		<!-- on white in dark mode: a picture's black ink is made for paper -->
		<div class="dark:rounded-base flex justify-center dark:bg-white dark:p-2 [&>svg]:h-auto [&>svg]:max-w-full">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- the figure engine's own drawing, made from the picture -->
			{@html props.svg}
		</div>
	{:else if props.compiled}
		<div class="dark:rounded-base flex justify-center dark:bg-white dark:p-2">
			<img
				class="compiled-picture h-auto max-w-full"
				src={props.compiled.url}
				width={props.compiled.width}
				height={props.compiled.height}
				alt={props.title}
			/>
		</div>
	{:else}
		<FigurePlaceholder title={props.title} summary={props.summary} />
	{/if}
	{#if guest}
		<button
			type="button"
			class="figure-edit {place} cursor-default group-hover:opacity-50 focus-visible:opacity-50"
			aria-disabled="true"
			aria-label={m.figure_edit()}
			use:unavailableTip={m.unavailable_guest()}
		>
			<Pencil class="size-4" />
		</button>
	{:else}
		<button
			type="button"
			class="figure-edit {place} group-hover:opacity-100 focus-visible:opacity-100"
			aria-label={m.figure_edit()}
			use:tip={m.figure_edit()}
			onclick={props.onedit}
		>
			<Pencil class="size-4" />
		</button>
	{/if}
</div>

<style>
	.figure-edit {
		width: calc(var(--spacing) * 8);
		height: calc(var(--spacing) * 8);
		border: var(--default-border-width) solid var(--color-surface-300);
		border-radius: var(--radius-base);
		background: var(--color-surface-50);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--muted-text);
	}

	.figure-edit:hover {
		background: var(--color-surface-100);
		border-color: var(--color-surface-400);
	}

	:global(.dark) .figure-edit {
		background: var(--color-surface-800);
		border-color: var(--color-surface-700);
	}

	:global(.dark) .figure-edit:hover {
		background: var(--color-surface-700);
	}
</style>
