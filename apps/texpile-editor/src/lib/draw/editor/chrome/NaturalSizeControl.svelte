<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { tip } from '$lib/components/tooltip.svelte';
	import { naturalSizeText } from '../canvas/notices/canvasNoticeTexts';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { PointerReveal, pointerNearBox } from '../state/pointerReveal.svelte';
	import { CANVAS_PILL, CANVAS_TEXT_BUTTON } from '../ui/panelStyles';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const natural = $derived(naturalSizeText(props.editor));
	const reveal = new PointerReveal(pointerNearBox);
	const out = $derived(reveal.near || reveal.focused);
</script>

{#if natural}
	<div class="{CANVAS_PILL} absolute right-3 bottom-3 z-20 h-8" {@attach reveal.attach}>
		{#if !props.editor.picture?.layout}
			<span
				class="overflow-hidden transition-[max-width] duration-160 ease-out motion-reduce:transition-none {out ? 'max-w-40' : 'max-w-0'}"
			>
				<button class={CANVAS_TEXT_BUTTON} tabindex={out ? 0 : -1} onclick={() => props.editor.setFrame()}>
					<span class="cap-center">{m.figure_notice_set_size()}</span>
				</button>
			</span>
		{/if}
		<span
			class="text-muted px-2 text-xs whitespace-nowrap tabular-nums"
			use:tip={`${m.figure_notice_natural()}${m.figure_notice_natural_note()}`}
		>
			{natural}
		</span>
	</div>
{/if}
