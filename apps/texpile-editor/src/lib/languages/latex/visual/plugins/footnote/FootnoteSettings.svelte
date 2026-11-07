<script lang="ts">
	import { balancedBraces, Panel, type ChipSettingsProps } from '$lib/languages/latex/visual/core';
	import { readFootnote, writeFootnote, type FootnoteCommand } from './footnoteCommand';
	import { m } from '$lib/paraglide/messages';

	const props: ChipSettingsProps = $props();

	const footnote = $derived(readFootnote(props.source));

	function write(next: Partial<FootnoteCommand>) {
		if (footnote) props.write(writeFootnote(props.source, { ...footnote, ...next }));
	}
</script>

{#if footnote}
	<div class="flex flex-col gap-2">
		<Panel.Header title={m.drawn_chip_footnote_label()}>
			<label class="text-muted flex items-center gap-2 text-xs">
				{m.drawn_chip_footnote_number()}
				<input
					class="border-surface-300-700 rounded-base focus:border-primary-500 h-6 w-14 border bg-transparent px-2 text-sm tabular-nums outline-none"
					inputmode="numeric"
					placeholder={m.drawn_chip_footnote_automatic()}
					value={footnote.number}
					oninput={(e) => {
						const value = e.currentTarget.value.trim();
						if (/^\d*$/.test(value)) write({ number: value });
					}}
				/>
			</label>
		</Panel.Header>
		<Panel.TextArea
			value={footnote.note}
			label={m.drawn_chip_footnote_label()}
			oninput={(note) => {
				// a brace typed on its way to its pair waits for it
				if (balancedBraces(note)) write({ note });
			}}
		/>
	</div>
{/if}
