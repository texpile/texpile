<script lang="ts">
	import type { ChipSettingsProps } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import { readFootnote, writeFootnote } from '../footnoteCall';
	import { m } from '$lib/paraglide/messages';

	const props: ChipSettingsProps = $props();

	const footnote = $derived(readFootnote(props.source));

	function write(note: string) {
		// a bracket typed on its way to its pair waits for it
		const next = writeFootnote(props.source, note);
		if (next !== null && next !== props.source) props.write(next);
	}
</script>

{#if footnote}
	<div class="flex flex-col gap-2">
		<Panel.Header title={m.drawn_chip_footnote_label()} command="#footnote" />
		<Panel.TextArea value={footnote.note} label={m.drawn_chip_footnote_label()} oninput={write} />
	</div>
{/if}
