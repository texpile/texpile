<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { PlotSeries } from '../figure/figureLanguage';
	import ChoiceField from '../inspector/fields/ChoiceField.svelte';
	import ColorField from '../inspector/fields/ColorField.svelte';
	import PairField from '../inspector/fields/PairField.svelte';
	import TextField from '../inspector/fields/TextField.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { withBound, writeSelectedPlot } from './plotCommands';

	const MARKS = [
		{ value: 'none', label: m.figure_plot_marks_none() },
		{ value: '*', label: '●' },
		{ value: 'o', label: '○' },
		{ value: 'square*', label: '■' }
	];
	const LINE_STYLES = [
		{ value: 'solid', label: m.figure_plot_line_solid() },
		{ value: 'dashed', label: m.figure_plot_line_dashed() },
		{ value: 'only marks', label: m.figure_plot_line_marks_only() }
	];

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const st = $derived(props.editor.selectedStatement);
	const plot = $derived(st ? props.editor.language.readPlot(props.editor.source, st) : null);

	function write(change: Partial<PlotSeries>) {
		writeSelectedPlot(props.editor, change);
	}
</script>

{#if plot}
	{#if plot.expression !== null}
		<!-- a field holding text it refused is for that statement alone -->
		{#key props.editor.selected}
			<!-- pgfplots' own math: x^2, sin(deg(x)), exp(-x) -->
			<TextField
				label="y ="
				mono
				value={plot.expression}
				check={(t) => props.editor.language.textProblem(t)}
				oncommit={(t) => t.trim() && write({ expression: t.trim() })}
			/>
		{/key}
		<PairField
			label={m.figure_plot_x_range()}
			names={[m.figure_plot_from(), m.figure_plot_to()]}
			unit=""
			values={plot.domain}
			clearable
			signed
			oncommit={(k, v) => write({ domain: withBound(plot.domain, k, v) })}
		/>
	{/if}
	<ColorField
		label={m.figure_plot_color()}
		value={plot.color}
		allowNone={false}
		colors={props.editor.language.styleChoices.colors}
		onpick={(c) => write({ color: c })}
	/>
	<ChoiceField
		label={m.figure_plot_marks()}
		options={MARKS}
		value={plot.mark}
		onpick={(mark) => write({ mark: mark as PlotSeries['mark'] })}
	/>
	<ChoiceField
		label={m.figure_plot_line()}
		options={LINE_STYLES}
		value={plot.line}
		onpick={(l) => write({ line: l as PlotSeries['line'] })}
	/>
{/if}
