<script lang="ts">
	// a figure in the paper: its last drawing, or a dashed frame naming it until it is first drawn
	import { Pencil, Shapes } from '@lucide/svelte';

	type Props = {
		/** the last drawing, as svg */
		svg: string | null;
		/** TikZ figure, CeTZ figure */
		title: string;
		summary: string;
		onedit: () => void;
	};
	const props: Props = $props();
</script>

<div class="relative {props.svg ? 'w-fit max-w-full' : 'w-full max-w-md'}">
	{#if props.svg}
		<div class="flex justify-center [&>svg]:h-auto [&>svg]:max-w-full">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- the figure engine's own drawing, made from the picture -->
			{@html props.svg}
		</div>
	{:else}
		<div
			class="border-surface-300-700 text-muted rounded-base flex h-36 w-full flex-col items-center justify-center gap-1 border border-dashed"
		>
			<Shapes class="size-6" />
			<span class="text-surface-950-50 text-sm font-semibold">{props.title}</span>
			{#if props.summary}<span class="text-xs">{props.summary}</span>{/if}
		</div>
	{/if}
	<!-- beside a drawing, so it covers none of it -->
	<button
		type="button"
		class="btn btn-sm preset-tonal bg-surface-50-950 absolute opacity-0 {props.svg
			? 'top-0 left-full ml-2'
			: 'top-2 right-2'} shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
		onclick={props.onedit}
	>
		<Pencil class="size-3.5" />
		<span class="cap-center">Edit figure</span>
	</button>
</div>
