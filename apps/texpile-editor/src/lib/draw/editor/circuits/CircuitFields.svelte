<script lang="ts">
	import TextField from '../inspector/fields/TextField.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { FIELD_LABEL } from '../ui/panelStyles';
	import CircuitPartPicker from './CircuitPartPicker.svelte';
	import { writeSelectedPart } from './circuitCommands';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
	const ed = $derived(props.editor);
	const parts = $derived(ed.selectedStatement ? ed.language.readCircuit(ed.source, ed.selectedStatement) : []);
	const marks = [
		{ key: 'label', label: 'Label' },
		{ key: 'voltage', label: 'Voltage' },
		{ key: 'current', label: 'Current' }
	] as const;
</script>

{#each parts as part, k (k)}
	{#if parts.length > 1}<div class="{FIELD_LABEL} px-3 pt-3">Part {k + 1}</div>{/if}
	<CircuitPartPicker
		parts={ed.language.circuitParts.filter((p) => p.placed === part.placed)}
		value={part.type}
		onpick={(id) => writeSelectedPart(ed, k, { type: id })}
	/>
	{#if part.placed === 'path'}
		<!-- a field holding text it refused is for that part alone -->
		{#key `${ed.selected}:${k}`}
			{#each marks as mark (mark.key)}
				<TextField
					label={mark.label}
					value={part[mark.key] ?? ''}
					check={(t) => ed.language.textProblem(t)}
					oncommit={(t) => writeSelectedPart(ed, k, { [mark.key]: t })}
				/>
			{/each}
		{/key}
	{/if}
{/each}
