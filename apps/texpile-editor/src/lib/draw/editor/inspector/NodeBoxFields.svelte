<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { NodeBoxChange, NodeShape } from '../figure/figureLanguage';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import ChoiceField from './fields/ChoiceField.svelte';
	import PairField from './fields/PairField.svelte';
	import { writeSelectedNodeBox } from './nodeBoxCommands';
	import StateField from './StateField.svelte';

	const SHAPES: { value: NodeShape; label: () => string }[] = [
		{ value: 'rectangle', label: () => m.figure_shape_box() },
		{ value: 'rounded', label: () => m.figure_style_rounded() },
		{ value: 'terminal', label: () => m.figure_shape_pill() },
		{ value: 'circle', label: () => m.figure_shape_circle() },
		{ value: 'ellipse', label: () => m.figure_shape_ellipse() },
		{ value: 'diamond', label: () => m.figure_shape_diamond() },
		{ value: 'slant', label: () => m.figure_shape_slant() },
		{ value: 'cylinder', label: () => m.figure_shape_cylinder() }
	];

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const st = $derived(props.editor.selectedStatement);
	const box = $derived(st ? props.editor.language.readNodeBox(props.editor.source, st) : null);
	const shapes = $derived(
		SHAPES.filter((s) => props.editor.language.nodeShapes.includes(s.value)).map((s) => ({ value: s.value, label: s.label() }))
	);

	function write(change: NodeBoxChange) {
		writeSelectedNodeBox(props.editor, change);
	}
</script>

{#if box?.state}
	<!-- a state's outline is the automata library's circle -->
	<StateField initial={box.state.initial} accepting={box.state.accepting} onchange={write} />
{:else if box}
	<ChoiceField label={m.figure_shape()} options={shapes} columns={3} value={box.shape} onpick={(s) => write({ shape: s as NodeShape })} />
	<PairField label={m.figure_minimum_size()} values={[box.w, box.h]} clearable oncommit={(k, v) => write(k === 0 ? { w: v } : { h: v })} />
{/if}
