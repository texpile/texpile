<script lang="ts">
	import { m } from '$lib/paraglide/messages';
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
		{ value: 'bend left', label: m.figure_connector_bend_left() },
		{ value: 'bend right', label: m.figure_connector_bend_right() }
	];
	const LOOPS: { value: ConnectorRoute; label: string }[] = [
		{ value: 'loop above', label: m.figure_side_above() },
		{ value: 'loop below', label: m.figure_side_below() },
		{ value: 'loop left', label: m.figure_side_left() },
		{ value: 'loop right', label: m.figure_side_right() }
	];
	const LABEL_POSITIONS = [
		{ value: 'at start', label: m.figure_label_pos_start() },
		{ value: 'near start', label: m.figure_label_pos_near_start() },
		{ value: 'midway', label: m.figure_label_pos_middle() },
		{ value: 'near end', label: m.figure_label_pos_near_end() },
		{ value: 'at end', label: m.figure_label_pos_end() }
	];
	const LABEL_SIDES = [
		{ value: 'above', label: m.figure_side_above() },
		{ value: 'below', label: m.figure_side_below() },
		{ value: 'left', label: m.figure_side_left() },
		{ value: 'right', label: m.figure_side_right() },
		{ value: 'on', label: m.figure_side_on() }
	];

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const c = $derived(props.editor.selectedConnector);
	// from a node back to itself there is only a loop, on one side or another
	const loop = $derived(!!c?.connector.ends[0].node && c.connector.ends[0].node === c.connector.ends[1].node);
	const routes = $derived(
		loop ? LOOPS : c?.connector.route === 'curve' ? [...ROUTES, { value: 'curve' as const, label: m.figure_connector_curve() }] : ROUTES
	);
	const label = $derived(c?.connector.label ?? null);
</script>

{#if c}
	<ChoiceField
		label={loop ? m.figure_connector_loop() : m.figure_connector_route()}
		options={routes}
		value={c.connector.route}
		onpick={(r) => writeSelectedConnector(props.editor, { route: r as ConnectorRoute })}
	/>
	<!-- a field holding text it refused is for that statement alone -->
	{#key props.editor.selected}
		<TextField
			label={m.figure_connector_label()}
			value={label?.text ?? ''}
			check={(t) => props.editor.language.textProblem(t)}
			oncommit={(t) => writeSelectedLabelText(props.editor, t)}
		/>
	{/key}
	{#if label}
		<ChoiceField
			label={m.figure_connector_label_along()}
			options={LABEL_POSITIONS}
			columns={3}
			value={label.pos}
			onpick={(p) => placeSelectedLabel(props.editor, { pos: p as ConnectorLabel['pos'] })}
		/>
		<ChoiceField
			label={m.figure_connector_label_beside()}
			options={LABEL_SIDES}
			value={label.side ?? 'on'}
			onpick={(s) => placeSelectedLabel(props.editor, { side: s === 'on' ? null : (s as ConnectorLabel['side']) })}
		/>
	{/if}
{/if}
