<script lang="ts">
	import { Panel, type ChipSettingsProps } from '$lib/languages/latex/visual/core';
	import { PAGE_BREAKS, readPageBreak, writePageBreak } from './pageBreakCommand';
	import { m } from '$lib/paraglide/messages';

	const props: ChipSettingsProps = $props();

	const current = $derived(readPageBreak(props.source));

	const labels: Record<string, () => string> = {
		newpage: m.drawn_chip_page_newpage,
		clearpage: m.drawn_chip_page_clearpage,
		cleardoublepage: m.drawn_chip_page_cleardoublepage,
		pagebreak: m.drawn_chip_page_pagebreak
	};
	const options: Panel.PanelChoice[] = PAGE_BREAKS.map((name) => ({ value: name, label: labels[name](), detail: `\\${name}` }));
</script>

{#if current}
	<div class="flex flex-col gap-2">
		<Panel.Header title={m.drawn_chip_page_label()} command={`\\${current}`} />
		<Panel.Choices
			{options}
			selected={current}
			label={m.drawn_chip_page_label()}
			onpick={(name) => props.write(writePageBreak(props.source, name))}
		/>
	</div>
{/if}
