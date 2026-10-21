<script lang="ts">
	import type { ChipSettingsProps } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import { balancedBraces } from './balancedBraces';
	import { readHyperref, writeHyperref, type HyperrefCommand } from './hyperrefCommand';
	import LabelField from './LabelField.svelte';
	import { m } from '$lib/paraglide/messages';

	const props: ChipSettingsProps = $props();

	const link = $derived(readHyperref(props.source));

	function write(next: Partial<HyperrefCommand>) {
		if (link) props.write(writeHyperref(props.source, { ...link, ...next }));
	}
</script>

{#if link}
	<div class="flex flex-col gap-2">
		<Panel.Header title={m.drawn_chip_hyperref_title()} command="\hyperref" />
		<LabelField
			value={link.label}
			view={props.view}
			oninput={(label) => {
				if (!/[{}\]]/.test(label)) write({ label });
			}}
			onjump={() => {
				const label = link.label.trim();
				if (!label) return;
				const { jump } = props;
				props.close();
				jump(label);
			}}
		/>
		<Panel.Row label={m.drawn_chip_hyperref_text()}>
			<Panel.TextField
				value={link.text}
				label={m.drawn_chip_hyperref_text()}
				oninput={(text) => {
					if (balancedBraces(text)) write({ text });
				}}
			/>
		</Panel.Row>
	</div>
{/if}
