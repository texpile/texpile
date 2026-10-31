<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { PANEL_BUTTON } from '../ui/panelStyles';
	import { ChartScatter, ChartSpline } from '@lucide/svelte';
	import type { PlotAxis } from '../figure/figureLanguage';
	import ChoiceField from '../inspector/fields/ChoiceField.svelte';
	import PairField from '../inspector/fields/PairField.svelte';
	import TextField from '../inspector/fields/TextField.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { addPlotToSelectedAxis, withBound, writeSelectedAxis } from './plotCommands';

	const GRIDS = [
		{ value: 'none', label: m.figure_plot_grid_none() },
		{ value: 'major', label: m.figure_plot_grid_major() },
		{ value: 'both', label: m.figure_plot_grid_fine() }
	];
	const AXIS_LINES = [
		{ value: 'box', label: m.figure_plot_axis_box() },
		{ value: 'left', label: m.figure_plot_axis_left() },
		{ value: 'middle', label: m.figure_plot_axis_cross() }
	];

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const st = $derived(props.editor.selectedStatement);
	const axis = $derived(st ? props.editor.language.readAxis(props.editor.source, st) : null);

	function write(change: Partial<PlotAxis>) {
		writeSelectedAxis(props.editor, change);
	}
	function check(t: string) {
		return props.editor.language.textProblem(t);
	}
</script>

{#if axis}
	<!-- a field holding text it refused is for that statement alone -->
	{#key props.editor.selected}
		<TextField label={m.figure_plot_title()} value={axis.title ?? ''} {check} oncommit={(t) => write({ title: t.trim() || null })} />
		<TextField label={m.figure_plot_x_label()} value={axis.xlabel ?? ''} {check} oncommit={(t) => write({ xlabel: t.trim() || null })} />
		<TextField label={m.figure_plot_y_label()} value={axis.ylabel ?? ''} {check} oncommit={(t) => write({ ylabel: t.trim() || null })} />
	{/key}
	<PairField
		label={m.figure_plot_x_range()}
		names={['min', 'max']}
		unit=""
		values={axis.x}
		clearable
		signed
		oncommit={(k, v) => write({ x: withBound(axis.x, k, v) })}
	/>
	<PairField
		label={m.figure_plot_y_range()}
		names={['min', 'max']}
		unit=""
		values={axis.y}
		clearable
		signed
		oncommit={(k, v) => write({ y: withBound(axis.y, k, v) })}
	/>
	<PairField
		label={m.figure_plot_size()}
		values={[axis.width, axis.height]}
		clearable
		oncommit={(k, v) => write(k === 0 ? { width: v } : { height: v })}
	/>
	<ChoiceField label={m.figure_plot_grid()} options={GRIDS} value={axis.grid} onpick={(g) => write({ grid: g as PlotAxis['grid'] })} />
	<ChoiceField
		label={m.figure_plot_axis_lines()}
		options={AXIS_LINES}
		value={axis.lines}
		onpick={(l) => write({ lines: l as PlotAxis['lines'] })}
	/>
	<div class="flex flex-wrap gap-1.5 px-3 pt-3">
		<button class="{PANEL_BUTTON} flex-1" onclick={() => addPlotToSelectedAxis(props.editor, 'function')}>
			<ChartSpline class="size-4" /><span class="cap-center">{m.figure_plot_add_function()}</span>
		</button>
		<button class="{PANEL_BUTTON} flex-1" onclick={() => addPlotToSelectedAxis(props.editor, 'points')}>
			<ChartScatter class="size-4" /><span class="cap-center">{m.figure_plot_add_points()}</span>
		</button>
	</div>
{/if}
