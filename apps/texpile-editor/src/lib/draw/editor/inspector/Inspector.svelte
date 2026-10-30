<script lang="ts">
	import { Trash2 } from '@lucide/svelte';
	import { PANEL_NOTE } from '../ui/panelStyles';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { deleteSelection } from '../state/selection/selectionCommands';
	import { tip } from '../ui/tooltip';
	import PairField from './fields/PairField.svelte';
	import { cmPerUnit } from '../state/sheetFrame';
	import InspectorFields from './InspectorFields.svelte';
	import CircuitPartPicker from '../circuits/CircuitPartPicker.svelte';
	import StyleFields from './StyleFields.svelte';
	import { nextShapeStyle } from '../state/selection/selectionStyle';
	import { ALL_TOOLS } from '../tools/tools';

	const HINTS = {
		drawing: 'Select a shape to style or move it, or pick a tool to draw one.',
		grid: 'Select a cell to edit its text or move it, or an arrow to label and style it.',
		tree: 'Select a node to edit its text, add to it, or move it.'
	};

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
	const panes = $derived(props.editor.panes);
	const st = $derived(props.editor.selectedStatement);
	const count = $derived(props.editor.selection.length);
	const next = $derived(st ? null : nextShapeStyle(props.editor));
	const placing = $derived(!st && props.editor.tool === 'component');
	const heading = $derived.by(() => {
		const tool = ALL_TOOLS.find((t) => t.id === props.editor.tool);
		if ((next || placing) && tool) return `New ${tool.label.split(',')[0].toLowerCase()}`;
		if (!st || !props.editor.selectedInfo) return 'Canvas';
		if (count > 1) return `${count} shapes`;
		return props.editor.language.readLabel(props.editor.source, st) ?? props.editor.selectedInfo.title;
	});
</script>

<!-- the region stays when nothing is selected, so selecting never moves or covers the canvas -->
<section
	class="border-surface-200-800 flex min-h-0 flex-col {panes.objectsOpen ? 'border-t' : 'flex-1'}"
	style:flex={panes.objectsOpen ? `0 1 round(${panes.inspectorShare * 100}%, 1px)` : undefined}
>
	<div class="border-surface-200-800 flex h-9 shrink-0 items-center justify-between gap-2 border-b pr-1.5 pl-3">
		<span class="min-w-0 truncate text-sm font-semibold">{heading}</span>
		{#if st}
			<button
				class="btn-icon btn-icon-xs hover:preset-tonal"
				onclick={() => deleteSelection(props.editor)}
				aria-label="Delete"
				use:tip={'Delete (Del)'}><Trash2 class="size-3.5 shrink-0" /></button
			>
		{/if}
	</div>
	<div class="scroll-inset-r min-h-0 flex-1 overflow-y-auto pb-3 [scrollbar-gutter:stable]">
		{#if st}
			<InspectorFields editor={props.editor} />
		{:else if placing}
			<CircuitPartPicker
				parts={props.editor.language.circuitParts}
				value={props.editor.nextPart}
				onpick={(id) => props.editor.pickNextPart(id)}
			/>
			<p class={PANEL_NOTE}>Drag from one end to the other. A transistor, an op amp or a ground is placed with a click.</p>
		{:else if next}
			<StyleFields editor={props.editor} shown={next} onpick={(change) => props.editor.pickNextStyle(change)} />
		{:else}
			{#if props.editor.frame}
				{@const f = props.editor.frame}
				<!-- on the paper; the frame is written in the picture's own units -->
				{@const [cx, cy] = cmPerUnit(props.editor.render.transformOf(0))}
				<PairField
					label="Canvas size"
					values={[(f.x2 - f.x1) * cx, (f.y2 - f.y1) * cy]}
					clearable
					oncommit={(k, v) =>
						v === null
							? props.editor.clearFrame()
							: props.editor.setFrame({ w: k === 0 ? v / cx : f.x2 - f.x1, h: k === 1 ? v / cy : f.y2 - f.y1 })}
				/>
			{/if}
			<p class={PANEL_NOTE}>
				{HINTS[props.editor.picture?.layout ?? 'drawing']}
			</p>
		{/if}
	</div>
</section>
