<script lang="ts">
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import type { SetField } from '../setRule/setRuleFields';
	import type { FieldValue } from '../setRule/setRuleCall';
	import { SET_FIELD_LABELS } from './setRuleFieldLabels';
	import { m } from '$lib/paraglide/messages';

	type Props = { field: SetField; value: FieldValue; autofocus: boolean; oninput: (text: string) => void };

	const props: Props = $props();

	const label = $derived(SET_FIELD_LABELS[props.field.name]?.() ?? props.field.name);
	const mono = $derived(props.value.code || !['string', 'names', 'content'].includes(props.field.kind));
</script>

{#if props.field.kind === 'boolean' && !props.value.code}
	<Panel.Switch {label} checked={props.value.text === 'true'} onchange={(on) => props.oninput(on ? 'true' : 'false')} />
{:else}
	<Panel.Row {label}>
		<Panel.TextField
			value={props.value.text}
			{label}
			{mono}
			autofocus={props.autofocus}
			suggestions={props.value.code ? undefined : props.field.suggestions}
			placeholder={props.field.hint ? m.drawn_chip_typst_field_default({ value: props.field.hint }) : undefined}
			oninput={props.oninput}
		/>
	</Panel.Row>
{/if}
