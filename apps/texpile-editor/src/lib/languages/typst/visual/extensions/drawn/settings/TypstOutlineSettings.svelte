<script lang="ts">
	import type { ChipSettingsProps } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import { readOutline, writeOutline, type OutlineCall, type OutlineShows } from '../outlineCall';
	import { OUTLINE_NAMES } from '../outlineLabel';
	import { m } from '$lib/paraglide/messages';

	const ALL_LEVELS = 'all';
	const LEVELS = ['1', '2', '3'];

	const props: ChipSettingsProps = $props();

	const outline = $derived(readOutline(props.source));
	const shows: Panel.PanelSegment[] = [
		{ value: 'headings', label: m.drawn_chip_typst_outline_headings() },
		{ value: 'figures', label: m.drawn_chip_typst_outline_figure_items() },
		{ value: 'tables', label: m.drawn_chip_typst_outline_table_items() }
	];
	const levels = $derived.by((): Panel.PanelSegment[] => {
		const depth = outline?.depth;
		// a deeper outline than the offered depths keeps its own on offer
		const offered = depth && !LEVELS.includes(String(depth)) ? [...LEVELS, String(depth)] : LEVELS;
		return [
			{ value: ALL_LEVELS, label: m.drawn_chip_typst_outline_all_levels() },
			...offered.map((level) => ({ value: level, label: level }))
		];
	});
	const title = $derived(outline?.title.kind === 'written' ? outline.title.text : '');

	function write(next: Partial<OutlineCall>) {
		const written = writeOutline(props.source, next);
		if (written !== null && written !== props.source) props.write(written);
	}

	function writeTitle(text: string) {
		const quoted = outline?.title.kind === 'written' && outline.title.quoted;
		write({ title: text ? { kind: 'written', text, quoted } : { kind: 'auto' } });
	}
</script>

{#if outline}
	<div class="flex flex-col gap-2">
		<Panel.Header title={OUTLINE_NAMES[outline.shows]()} command="#outline" />
		<Panel.Row label={m.drawn_chip_typst_outline_lists()}>
			<Panel.Segments
				options={shows}
				selected={outline.shows}
				label={m.drawn_chip_typst_outline_lists()}
				onpick={(value) => write({ shows: value as OutlineShows })}
			/>
		</Panel.Row>
		<Panel.Row label={m.drawn_chip_typst_field_title()}>
			<Panel.TextField
				value={title}
				label={m.drawn_chip_typst_field_title()}
				autofocus
				placeholder={outline.title.kind === 'none' ? m.drawn_chip_typst_outline_no_title() : m.drawn_chip_typst_outline_auto_title()}
				oninput={writeTitle}
			/>
		</Panel.Row>
		{#if outline.shows === 'headings'}
			<Panel.Row label={m.drawn_chip_typst_outline_depth()}>
				<Panel.Segments
					options={levels}
					selected={outline.depth === null ? ALL_LEVELS : String(outline.depth)}
					label={m.drawn_chip_typst_outline_depth()}
					onpick={(value) => write({ depth: value === ALL_LEVELS ? null : Number(value) })}
				/>
			</Panel.Row>
		{/if}
		<Panel.Switch
			label={m.drawn_chip_typst_outline_show_title()}
			checked={outline.title.kind !== 'none'}
			onchange={(show) => write({ title: show ? { kind: 'auto' } : { kind: 'none' } })}
		/>
	</div>
{/if}
