<script lang="ts">
	import { PANEL_NOTE } from '../ui/panelStyles';
	import { Lock } from '@lucide/svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { moveSelectionBy } from '../state/selection/selectionCommands';
	import ConnectorFields from '../connectors/ConnectorFields.svelte';
	import ArrowFields from '../diagrams/ArrowFields.svelte';
	import CircuitFields from '../circuits/CircuitFields.svelte';
	import BranchFields from '../trees/BranchFields.svelte';
	import AxisFields from '../plots/AxisFields.svelte';
	import PlotFields from '../plots/PlotFields.svelte';
	import PlacementField from '../placement/PlacementField.svelte';
	import AlignField from './AlignField.svelte';
	import NodeBoxFields from './NodeBoxFields.svelte';
	import PositionField from './PositionField.svelte';
	import StyleFields from './StyleFields.svelte';
	import { selectionStyle, styleSelection } from '../state/selection/selectionStyle';
	import TextField from './fields/TextField.svelte';

	// kinds whose own fields say what can be done with them
	const FIELDS_OF_THEIR_OWN = ['plot', 'axis', 'cell', 'arrow', 'branch'];

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
	const st = $derived(props.editor.selectedStatement);
	const described = $derived(props.editor.selectedInfo);
	const shown = $derived(selectionStyle(props.editor));
	// several shapes share the style fields, which write to all of them, and get align in place of position
	const many = $derived(props.editor.selection.length > 1);
	const first = $derived(
		st && described?.movable && !many ? props.editor.language.pathPoints(props.editor.source, st).find((p) => !p.relative) : null
	);
	const placement = $derived(st && !many ? props.editor.language.readPlacement(props.editor.source, st) : null);
	// a transistor or a ground is drawn by its part, not an outline
	const partNode = $derived(!!st && props.editor.language.readCircuit(props.editor.source, st).some((p) => p.placed === 'node'));
	const nodeText = $derived(described?.text && st && !many ? props.editor.language.readText(props.editor.source, st) : null);
</script>

{#if st && described}
	{#if nodeText !== null}
		<!-- a field holding text it refused is for that statement alone -->
		{#key st.i}
			<TextField
				label="Text"
				value={nodeText}
				check={(t) => props.editor.language.textProblem(t)}
				onpreview={(t) => props.editor.previewNodeText(t)}
				oncommit={(t) => props.editor.setNodeText(t)}
			/>
		{/key}
	{/if}
	{#if !many}<CircuitFields editor={props.editor} />{/if}
	{#if st.kind === 'node' && !many && !partNode}<NodeBoxFields editor={props.editor} />{/if}
	{#if shown}<StyleFields editor={props.editor} {shown} onpick={(change) => styleSelection(props.editor, change)} />{/if}
	{#if props.editor.selectedConnector && !many}<ConnectorFields editor={props.editor} />{/if}
	{#if st.kind === 'axis' && !many}<AxisFields editor={props.editor} />{/if}
	{#if st.kind === 'plot' && !many}<PlotFields editor={props.editor} />{/if}
	{#if st.kind === 'arrow' && !many}<ArrowFields editor={props.editor} />{/if}
	{#if st.kind === 'branch' && !many}<BranchFields editor={props.editor} />{/if}
	{#if st.kind === 'cell' && !many}
		<p class={PANEL_NOTE}>Drag it to a free place on the grid. Drag from one of its sides onto another cell to draw an arrow.</p>
	{/if}
	{#if placement}
		<PlacementField editor={props.editor} {placement} />
	{:else if first}
		<PositionField x={first.x} y={first.y} onmove={(du, dv) => moveSelectionBy(props.editor, du, dv)} />
	{/if}
	{#if many}<AlignField editor={props.editor} />{/if}
	{#if st.kind === 'scope' && described.movable && !many}
		<p class={PANEL_NOTE}>Moves and stretches as one. Double-click a shape in it, or pick one in the list, to edit that shape alone.</p>
	{/if}
	{#if !described.movable && !many && !props.editor.selectedConnector && !FIELDS_OF_THEIR_OWN.includes(st.kind)}
		<p class="{PANEL_NOTE} flex gap-2">
			<Lock size={14} class="mt-0.5 shrink-0" />
			<span>{props.editor.language.engineName} draws this statement, but the canvas cannot move it. Edit it in the code.</span>
		</p>
	{/if}
{/if}
