<script lang="ts">
	import type { ChipSettingsProps } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import { BREAK_KINDS, readBreak, writeBreak, type BreakCall, type BreakKind } from '../breakCall';
	import { m } from '$lib/paraglide/messages';

	const LABELS: Record<BreakKind, () => string> = {
		page: m.drawn_chip_page_newpage,
		odd: m.drawn_chip_page_cleardoublepage,
		even: m.drawn_chip_typst_break_even,
		column: m.drawn_chip_typst_column_break
	};
	const DETAILS: Record<BreakKind, string> = { page: '#pagebreak()', odd: 'to: "odd"', even: 'to: "even"', column: '#colbreak()' };

	const props: ChipSettingsProps = $props();

	const current = $derived(readBreak(props.source));
	const options: Panel.PanelChoice[] = BREAK_KINDS.map((kind) => ({ value: kind, label: LABELS[kind](), detail: DETAILS[kind] }));

	function write(next: Partial<BreakCall>) {
		if (!current) return;
		const written = writeBreak(props.source, { ...current, ...next });
		if (written !== null && written !== props.source) props.write(written);
	}
</script>

{#if current}
	<div class="flex flex-col gap-2">
		<Panel.Header title={m.drawn_chip_typst_break_title()} command={current.kind === 'column' ? '#colbreak' : '#pagebreak'} />
		<Panel.Choices
			{options}
			selected={current.kind}
			label={m.drawn_chip_typst_break_title()}
			onpick={(kind) => write({ kind: kind as BreakKind })}
		/>
		<Panel.Switch
			label={current.kind === 'column' ? m.drawn_chip_typst_break_weak_column() : m.drawn_chip_typst_break_weak_page()}
			checked={current.weak}
			onchange={(weak) => write({ weak })}
		/>
	</div>
{/if}
