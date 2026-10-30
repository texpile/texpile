<script lang="ts">
	import type { NodeBoxChange, NodeShape } from '../figure/figureLanguage';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import ChoiceField from './fields/ChoiceField.svelte';
	import PairField from './fields/PairField.svelte';
	import { writeSelectedNodeBox } from './nodeBoxCommands';
	import StateField from './StateField.svelte';

	const SHAPES: { value: NodeShape; label: string }[] = [
		{ value: 'rectangle', label: 'Box' },
		{ value: 'rounded', label: 'Rounded' },
		{ value: 'terminal', label: 'Pill' },
		{ value: 'circle', label: 'Circle' },
		{ value: 'ellipse', label: 'Ellipse' },
		{ value: 'diamond', label: 'Diamond' },
		{ value: 'slant', label: 'Slant' },
		{ value: 'cylinder', label: 'Cylinder' }
	];

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const st = $derived(props.editor.selectedStatement);
	const box = $derived(st ? props.editor.language.readNodeBox(props.editor.source, st) : null);
	const shapes = $derived(SHAPES.filter((s) => props.editor.language.nodeShapes.includes(s.value)));

	function write(change: NodeBoxChange) {
		writeSelectedNodeBox(props.editor, change);
	}
</script>

{#if box?.state}
	<!-- a state's outline is the automata library's circle -->
	<StateField initial={box.state.initial} accepting={box.state.accepting} onchange={write} />
{:else if box}
	<ChoiceField label="Shape" options={shapes} columns={3} value={box.shape} onpick={(s) => write({ shape: s as NodeShape })} />
	<PairField label="Minimum size" values={[box.w, box.h]} clearable oncommit={(k, v) => write(k === 0 ? { w: v } : { h: v })} />
{/if}
