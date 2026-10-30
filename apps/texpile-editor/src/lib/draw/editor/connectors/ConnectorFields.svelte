<script lang="ts">
	import type { ConnectorLabel, ConnectorRoute } from '../figure/figureLanguage';
	import ChoiceField from '../inspector/fields/ChoiceField.svelte';
	import TextField from '../inspector/fields/TextField.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { placeSelectedLabel, writeSelectedConnector, writeSelectedLabelText } from './connectorCommands';

	// in TikZ's own notation, which the code shows too
	const ROUTES: { value: ConnectorRoute; label: string }[] = [
		{ value: 'straight', label: '--' },
		{ value: 'hv', label: '-|' },
		{ value: 'vh', label: '|-' },
		{ value: 'bend left', label: 'bend ↶' },
		{ value: 'bend right', label: 'bend ↷' }
	];
	const LOOPS: { value: ConnectorRoute; label: string }[] = [
		{ value: 'loop above', label: 'Above' },
		{ value: 'loop below', label: 'Below' },
		{ value: 'loop left', label: 'Left' },
		{ value: 'loop right', label: 'Right' }
	];
	const LABEL_POSITIONS = [
		{ value: 'at start', label: 'Start' },
		{ value: 'near start', label: 'Near start' },
		{ value: 'midway', label: 'Middle' },
		{ value: 'near end', label: 'Near end' },
		{ value: 'at end', label: 'End' }
	];
	const LABEL_SIDES = [
		{ value: 'above', label: 'Above' },
		{ value: 'below', label: 'Below' },
		{ value: 'left', label: 'Left' },
		{ value: 'right', label: 'Right' },
		{ value: 'on', label: 'On it' }
	];

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const c = $derived(props.editor.selectedConnector);
	// from a node back to itself there is only a loop, on one side or another
	const loop = $derived(!!c?.connector.ends[0].node && c.connector.ends[0].node === c.connector.ends[1].node);
	const routes = $derived(
		loop ? LOOPS : c?.connector.route === 'curve' ? [...ROUTES, { value: 'curve' as const, label: 'curve' }] : ROUTES
	);
	const label = $derived(c?.connector.label ?? null);
</script>

{#if c}
	<ChoiceField
		label={loop ? 'Loop' : 'Route'}
		options={routes}
		value={c.connector.route}
		onpick={(r) => writeSelectedConnector(props.editor, { route: r as ConnectorRoute })}
	/>
	<!-- a field holding text it refused is for that statement alone -->
	{#key props.editor.selected}
		<TextField
			label="Label"
			value={label?.text ?? ''}
			check={(t) => props.editor.language.textProblem(t)}
			oncommit={(t) => writeSelectedLabelText(props.editor, t)}
		/>
	{/key}
	{#if label}
		<ChoiceField
			label="Label along"
			options={LABEL_POSITIONS}
			columns={3}
			value={label.pos}
			onpick={(p) => placeSelectedLabel(props.editor, { pos: p as ConnectorLabel['pos'] })}
		/>
		<ChoiceField
			label="Label beside"
			options={LABEL_SIDES}
			value={label.side ?? 'on'}
			onpick={(s) => placeSelectedLabel(props.editor, { side: s === 'on' ? null : (s as ConnectorLabel['side']) })}
		/>
	{/if}
{/if}
