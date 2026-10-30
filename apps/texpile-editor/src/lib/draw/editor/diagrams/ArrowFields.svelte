<script lang="ts">
	import type { DiagramArrow } from '../figure/figureLanguage';
	import ChoiceField from '../inspector/fields/ChoiceField.svelte';
	import TextField from '../inspector/fields/TextField.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { writeSelectedArrow } from './arrowCommands';

	// tikz-cd's sides follow the arrow, so left and right would read backwards on one going down
	const LABEL_SIDES = [
		{ value: 'left', label: 'Usual' },
		{ value: 'right', label: 'Swapped' },
		{ value: 'on', label: 'On it' }
	];
	const HEADS = [
		{ value: 'to', label: '→' },
		{ value: 'hook', label: '↪' },
		{ value: 'two heads', label: '↠' },
		{ value: 'mapsto', label: '↦' },
		{ value: 'Rightarrow', label: '⇒' },
		{ value: 'dash', label: '—' },
		{ value: 'equal', label: '=' }
	];
	const LINE_STYLES = [
		{ value: 'solid', label: 'Solid' },
		{ value: 'dashed', label: 'Dashed' },
		{ value: 'dotted', label: 'Dotted' }
	];
	const BENDS = [
		{ value: 'none', label: 'Straight' },
		{ value: 'left', label: 'Left' },
		{ value: 'right', label: 'Right' }
	];

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const st = $derived(props.editor.selectedStatement);
	const arrow = $derived(st ? props.editor.language.readArrow(props.editor.source, st) : null);

	function write(change: Partial<DiagramArrow>) {
		writeSelectedArrow(props.editor, change);
	}
</script>

{#if arrow}
	<!-- a field holding text it refused is for that statement alone -->
	{#key props.editor.selected}
		<TextField
			label="Label"
			value={arrow.label}
			check={(t) => props.editor.language.textProblem(t)}
			oncommit={(t) => write({ label: t.trim() })}
		/>
	{/key}
	<ChoiceField label="Label side" options={LABEL_SIDES} value={arrow.side} onpick={(v) => write({ side: v as DiagramArrow['side'] })} />
	<ChoiceField label="Arrow" options={HEADS} value={arrow.head} onpick={(v) => write({ head: v as DiagramArrow['head'] })} />
	<ChoiceField label="Line" options={LINE_STYLES} value={arrow.line} onpick={(v) => write({ line: v as DiagramArrow['line'] })} />
	<ChoiceField label="Bend" options={BENDS} value={arrow.bend} onpick={(v) => write({ bend: v as DiagramArrow['bend'] })} />
{/if}
