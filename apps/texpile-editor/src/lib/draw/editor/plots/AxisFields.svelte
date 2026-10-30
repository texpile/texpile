<script lang="ts">
	import { PANEL_BUTTON } from '../ui/panelStyles';
	import { ChartScatter, ChartSpline } from '@lucide/svelte';
	import type { PlotAxis } from '../figure/figureLanguage';
	import ChoiceField from '../inspector/fields/ChoiceField.svelte';
	import PairField from '../inspector/fields/PairField.svelte';
	import TextField from '../inspector/fields/TextField.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { addPlotToSelectedAxis, withBound, writeSelectedAxis } from './plotCommands';

	const GRIDS = [
		{ value: 'none', label: 'None' },
		{ value: 'major', label: 'Major' },
		{ value: 'both', label: 'Fine' }
	];
	const AXIS_LINES = [
		{ value: 'box', label: 'Box' },
		{ value: 'left', label: 'Left' },
		{ value: 'middle', label: 'Cross' }
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
		<TextField label="Title" value={axis.title ?? ''} {check} oncommit={(t) => write({ title: t.trim() || null })} />
		<TextField label="x label" value={axis.xlabel ?? ''} {check} oncommit={(t) => write({ xlabel: t.trim() || null })} />
		<TextField label="y label" value={axis.ylabel ?? ''} {check} oncommit={(t) => write({ ylabel: t.trim() || null })} />
	{/key}
	<PairField
		label="x from, to"
		names={['min', 'max']}
		unit=""
		values={axis.x}
		clearable
		signed
		oncommit={(k, v) => write({ x: withBound(axis.x, k, v) })}
	/>
	<PairField
		label="y from, to"
		names={['min', 'max']}
		unit=""
		values={axis.y}
		clearable
		signed
		oncommit={(k, v) => write({ y: withBound(axis.y, k, v) })}
	/>
	<PairField label="Size" values={[axis.width, axis.height]} clearable oncommit={(k, v) => write(k === 0 ? { width: v } : { height: v })} />
	<ChoiceField label="Grid" options={GRIDS} value={axis.grid} onpick={(g) => write({ grid: g as PlotAxis['grid'] })} />
	<ChoiceField label="Axis lines" options={AXIS_LINES} value={axis.lines} onpick={(l) => write({ lines: l as PlotAxis['lines'] })} />
	<div class="flex flex-wrap gap-1.5 px-3 pt-3">
		<button class="{PANEL_BUTTON} flex-1" onclick={() => addPlotToSelectedAxis(props.editor, 'function')}>
			<ChartSpline class="size-4" /><span class="cap-center">Add function</span>
		</button>
		<button class="{PANEL_BUTTON} flex-1" onclick={() => addPlotToSelectedAxis(props.editor, 'points')}>
			<ChartScatter class="size-4" /><span class="cap-center">Add points</span>
		</button>
	</div>
{/if}
