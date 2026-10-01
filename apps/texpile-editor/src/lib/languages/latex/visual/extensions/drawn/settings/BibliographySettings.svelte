<script lang="ts">
	import type { ChipSettingsProps } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import { projectIntelStore } from '$lib/stores/projectIntel';
	import { BIB_STYLES, bibFileNames, readBibliography, writeBibliography } from './bibliographyCommand';
	import { m } from '$lib/paraglide/messages';

	const props: ChipSettingsProps = $props();

	const command = $derived(readBibliography(props.source));
	const suggestions = $derived(command?.style ? BIB_STYLES : bibFileNames(projectIntelStore.current.bibEntries));
</script>

{#if command}
	<div class="flex flex-col gap-2">
		<Panel.Header
			title={command.style ? m.drawn_chip_bib_style_title() : m.drawn_chip_bib_title()}
			command={command.style ? '\\bibliographystyle' : '\\bibliography'}
		/>
		<Panel.Row label={command.style ? m.drawn_chip_bib_style() : m.drawn_chip_bib_files()}>
			<Panel.TextField
				value={command.value}
				label={command.style ? m.drawn_chip_bib_style() : m.drawn_chip_bib_files()}
				mono
				autofocus
				{suggestions}
				oninput={(value) => {
					if (!/[{}]/.test(value)) props.write(writeBibliography(props.source, value));
				}}
			/>
		</Panel.Row>
		{#if !command.style}
			<p class="text-muted text-xs">{m.drawn_chip_bib_files_hint()}</p>
		{/if}
	</div>
{/if}
