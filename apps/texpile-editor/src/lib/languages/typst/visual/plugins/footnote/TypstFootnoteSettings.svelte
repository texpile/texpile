<script lang="ts">
	import { type ChipSettingsProps, Panel } from '$lib/languages/typst/visual/core';
	import { readFootnote, writeFootnote } from './footnoteCall';
	import { m } from '$lib/paraglide/messages';

	const props: ChipSettingsProps = $props();

	const footnote = $derived(readFootnote(props.source));
</script>

{#if footnote}
	<div class="flex flex-col gap-2">
		<Panel.Header title={m.drawn_chip_footnote_label()} command="#footnote" />
		<Panel.TextArea
			value={footnote.note}
			label={m.drawn_chip_footnote_label()}
			oninput={(note) => props.write(writeFootnote(props.source, note))}
		/>
	</div>
{/if}
