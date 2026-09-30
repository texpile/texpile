<script lang="ts">
	import type { ChipSettingsProps } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import { readSpacing, writeSpacing, type SpacingCall } from '../spacingCall';
	import { m } from '$lib/paraglide/messages';

	const SUGGESTIONS = ['0.5em', '1em', '2em', '5mm', '1cm', '1fr'];

	const props: ChipSettingsProps = $props();

	const space = $derived(readSpacing(props.source));

	function write(next: Partial<Pick<SpacingCall, 'amount' | 'weak'>>) {
		if (!space) return;
		// a length half typed (1e, 2 +) waits until it is one
		const written = writeSpacing(props.source, { amount: space.amount, weak: space.weak, ...next });
		if (written !== null && written !== props.source) props.write(written);
	}
</script>

{#if space}
	<div class="flex flex-col gap-2">
		<Panel.Header
			title={space.vertical ? m.drawn_chip_space_vertical() : m.drawn_chip_space_horizontal()}
			command={space.vertical ? '#v' : '#h'}
		/>
		<Panel.Row label={m.drawn_chip_space_length()}>
			<Panel.TextField
				value={space.amount}
				label={m.drawn_chip_space_length()}
				mono
				autofocus
				list="drawn-chip-typst-lengths"
				oninput={(amount) => write({ amount })}
			/>
		</Panel.Row>
		<!-- a weak space is the one Typst drops at the top of a page or the start of a line, so keeping it is not weak -->
		<Panel.Switch
			label={space.vertical ? m.drawn_chip_space_keep_vertical() : m.drawn_chip_space_keep_horizontal()}
			checked={!space.weak}
			onchange={(keep) => write({ weak: !keep })}
		/>
		<p class="text-muted text-xs">{m.drawn_chip_typst_space_hint()}</p>
		<datalist id="drawn-chip-typst-lengths">
			{#each SUGGESTIONS as suggestion (suggestion)}
				<option value={suggestion}></option>
			{/each}
		</datalist>
	</div>
{/if}
