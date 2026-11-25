<script lang="ts">
	// the answer drawn: a formula, a drawing, or the error a drawing still has
	import 'mathlive/static.css';
	import 'mathlive/fonts.css';
	import { m } from '$lib/paraglide/messages';
	import type { AnswerPreview } from '../answerPreview';

	const props: { preview: AnswerPreview } = $props();
</script>

{#if props.preview.kind === 'math'}
	<div class="overflow-x-auto py-2 text-center text-lg">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- MathLive's own markup, made from the answer -->
		{@html props.preview.markup}
	</div>
{:else if props.preview.kind === 'drawing'}
	<!-- on white in dark mode: a picture's black ink is made for paper -->
	<div class="dark:rounded-base flex justify-center dark:bg-white dark:p-2 [&>svg]:h-auto [&>svg]:max-h-[30vh] [&>svg]:max-w-full">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- the figure engine's own drawing, made from the answer -->
		{@html props.preview.svg}
	</div>
{:else if props.preview.kind === 'drawing-error'}
	<p class="text-error-ink text-xs leading-relaxed [overflow-wrap:anywhere]">{m.ai_image_draw_error({ error: props.preview.error })}</p>
{/if}
