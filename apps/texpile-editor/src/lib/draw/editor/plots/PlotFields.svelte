<script lang="ts">
	import type { PlotSeries } from '../figure/figureLanguage';
	import ChoiceField from '../inspector/fields/ChoiceField.svelte';
	import ColorField from '../inspector/fields/ColorField.svelte';
	import PairField from '../inspector/fields/PairField.svelte';
	import TextField from '../inspector/fields/TextField.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { withBound, writeSelectedPlot } from './plotCommands';

	const MARKS = [
		{ value: 'none', label: 'None' },
		{ value: '*', label: '●' },
		{ value: 'o', label: '○' },
		{ value: 'square*', label: '■' }
	];
	const LINE_STYLES = [
		{ value: 'solid', label: 'Solid' },
		{ value: 'dashed', label: 'Dashed' },
		{ value: 'only marks', label: 'Marks only' }
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
			label="x from, to"
			names={['from', 'to']}
			unit=""
			values={plot.domain}
			clearable
			signed
			oncommit={(k, v) => write({ domain: withBound(plot.domain, k, v) })}
		/>
	{/if}
	<ColorField
		label="Color"
		value={plot.color}
		allowNone={false}
		colors={props.editor.language.styleChoices.colors}
		onpick={(c) => write({ color: c })}
	/>
	<ChoiceField label="Marks" options={MARKS} value={plot.mark} onpick={(m) => write({ mark: m as PlotSeries['mark'] })} />
	<ChoiceField label="Line" options={LINE_STYLES} value={plot.line} onpick={(l) => write({ line: l as PlotSeries['line'] })} />
{/if}
