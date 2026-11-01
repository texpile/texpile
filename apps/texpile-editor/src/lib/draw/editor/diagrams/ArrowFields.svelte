<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { DiagramArrow } from '../figure/figureLanguage';
	import ChoiceField from '../inspector/fields/ChoiceField.svelte';
	import TextField from '../inspector/fields/TextField.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { writeSelectedArrow } from './arrowCommands';

	// tikz-cd's sides follow the arrow, so left and right would read backwards on one going down
	const LABEL_SIDES = [
		{ value: 'left', label: m.figure_arrow_side_usual() },
		{ value: 'right', label: m.figure_arrow_side_swapped() },
		{ value: 'on', label: m.figure_side_on() }
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
		{ value: 'solid', label: m.figure_dash_solid() },
		{ value: 'dashed', label: m.figure_dash_dashed() },
		{ value: 'dotted', label: m.figure_dash_dotted() }
	];
	const BENDS = [
		{ value: 'none', label: m.figure_arrow_bend_straight() },
		{ value: 'left', label: m.figure_side_left() },
		{ value: 'right', label: m.figure_side_right() }
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
			label={m.figure_connector_label()}
			value={arrow.label}
			check={(t) => props.editor.language.textProblem(t)}
			oncommit={(t) => write({ label: t.trim() })}
		/>
	{/key}
	<ChoiceField
		label={m.figure_arrow_label_side()}
		options={LABEL_SIDES}
		value={arrow.side}
		onpick={(v) => write({ side: v as DiagramArrow['side'] })}
	/>
	<ChoiceField
		label={m.figure_arrow_arrow()}
		options={HEADS}
		value={arrow.head}
		onpick={(v) => write({ head: v as DiagramArrow['head'] })}
	/>
	<ChoiceField
		label={m.figure_arrow_line()}
		options={LINE_STYLES}
		value={arrow.line}
		onpick={(v) => write({ line: v as DiagramArrow['line'] })}
	/>
	<ChoiceField
		label={m.figure_arrow_bend()}
		options={BENDS}
		value={arrow.bend}
		onpick={(v) => write({ bend: v as DiagramArrow['bend'] })}
	/>
{/if}
