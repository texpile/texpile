<script lang="ts">
	import type { ChipSettingsProps } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import { readTypstCall } from '../../core/reading/typstCall';
	import { horizontalAlignment, withHorizontal } from './layoutDrawing';
	import { firstPositionalValue, namedValue, withFirstPositional, withNamedArg } from './layoutEdits';
	import { m } from '$lib/paraglide/messages';

	type TextField = { arg: string | null; label: string; suggestions?: readonly string[] };

	const TITLES: Record<string, () => string> = {
		align: m.typ_layout_title_align,
		block: m.typ_layout_title_block,
		columns: m.typ_layout_title_columns,
		grid: m.typ_layout_title_grid,
		quote: m.typ_layout_title_quote
	};
	const FIELDS: Record<string, () => TextField[]> = {
		align: () => [{ arg: null, label: m.typ_layout_field_align(), suggestions: ['left', 'center', 'center + horizon', 'right'] }],
		block: () => [
			{ arg: 'fill', label: m.typ_layout_field_fill(), suggestions: ['luma(230)', 'rgb("#eef")', 'red.lighten(80%)'] },
			{ arg: 'inset', label: m.typ_layout_field_inset(), suggestions: ['8pt', '1em', '(x: 1em, y: 0.5em)'] },
			{ arg: 'stroke', label: m.typ_layout_field_stroke(), suggestions: ['0.5pt', '1pt + gray', 'none'] },
			{ arg: 'radius', label: m.typ_layout_field_radius(), suggestions: ['2pt', '4pt'] },
			{ arg: 'width', label: m.typ_layout_field_width(), suggestions: ['100%', '50%'] }
		],
		columns: () => [
			{ arg: null, label: m.typ_layout_field_columns(), suggestions: ['2', '3'] },
			{ arg: 'gutter', label: m.typ_layout_field_gutter(), suggestions: ['1em', '12pt'] }
		],
		quote: () => [{ arg: 'attribution', label: m.typ_layout_field_attribution() }],
		grid: () => [
			{ arg: 'columns', label: m.typ_layout_title_columns(), suggestions: ['2', '3', '(1fr, 1fr)', '(2fr, 1fr)'] },
			{ arg: 'gutter', label: m.typ_layout_field_gutter(), suggestions: ['1em', '12pt'] },
			{ arg: 'inset', label: m.typ_layout_field_inset(), suggestions: ['5pt', '1em'] }
		]
	};
	const SIDES: Panel.PanelSegment[] = [
		{ value: 'left', label: m.typ_layout_left() },
		{ value: 'center', label: m.typ_layout_center() },
		{ value: 'right', label: m.typ_layout_right() }
	];

	const props: ChipSettingsProps = $props();

	const call = $derived(readTypstCall(props.source));
	const name = $derived(call?.name ?? '');
	const fields = $derived(FIELDS[name]?.() ?? []);
	const alignment = $derived(call && name === 'align' ? firstPositionalValue(call) : '');
	const block = $derived(call && name === 'quote' ? namedValue(call, 'block') === 'true' : false);

	function valueOf(field: TextField): string {
		if (!call) return '';
		return field.arg === null ? firstPositionalValue(call) : namedValue(call, field.arg);
	}

	function writeField(field: TextField, value: string) {
		props.write(field.arg === null ? withFirstPositional(props.source, value) : withNamedArg(props.source, field.arg, value));
	}
</script>

{#if call}
	<div class="flex flex-col gap-2">
		<Panel.Header title={TITLES[name]?.() ?? `#${name}`} command={TITLES[name] ? `#${name}` : undefined} />
		{#if name === 'align'}
			<Panel.Segments
				options={SIDES}
				selected={horizontalAlignment(alignment)}
				label={m.typ_layout_field_align()}
				onpick={(side) => props.write(withFirstPositional(props.source, withHorizontal(alignment, side)))}
			/>
		{/if}
		{#each fields as field (field.label)}
			<Panel.Row label={field.label}>
				<Panel.TextField
					value={valueOf(field)}
					label={field.label}
					mono
					suggestions={field.suggestions}
					oninput={(value) => writeField(field, value)}
				/>
			</Panel.Row>
		{/each}
		{#if name === 'quote'}
			<Panel.Switch
				label={m.typ_layout_quote_block()}
				checked={block}
				onchange={(on) => props.write(withNamedArg(props.source, 'block', on ? 'true' : ''))}
			/>
		{/if}
	</div>
{/if}
