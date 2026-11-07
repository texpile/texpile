<script lang="ts">
	import {
		type ChipSettingsProps,
		Panel,
		type SetField,
		fieldValue,
		otherArguments,
		readSetRule,
		writeSetField,
		setRuleTargetLabel
	} from '$lib/languages/typst/visual/core';
	import TypstSetRuleField from './TypstSetRuleField.svelte';
	import { m } from '$lib/paraglide/messages';

	const props: ChipSettingsProps = $props();

	const rule = $derived(readSetRule(props.source));
	const others = $derived(rule ? otherArguments(rule) : []);
	// the panel opens on the first field that takes typing (a switch takes none)
	const typedFirst = $derived(rule?.fields.find((field) => field.kind !== 'boolean' || fieldValue(rule, field).code));

	function write(field: SetField, text: string) {
		props.write(rule ? writeSetField(rule, field, text) : null);
	}
</script>

{#if rule}
	<div class="flex flex-col gap-2">
		<Panel.Header title={setRuleTargetLabel(rule)} command={`#set ${rule.target}`} />
		{#each rule.fields as field (field.name)}
			<TypstSetRuleField {field} value={fieldValue(rule, field)} autofocus={field === typedFirst} oninput={(text) => write(field, text)} />
		{/each}
		{#if others.length}
			<p class="text-muted text-xs">{m.drawn_chip_typst_set_kept({ names: others.join(', ') })}</p>
		{/if}
		<p class="text-muted text-xs">{m.drawn_chip_typst_set_hint()}</p>
	</div>
{/if}
