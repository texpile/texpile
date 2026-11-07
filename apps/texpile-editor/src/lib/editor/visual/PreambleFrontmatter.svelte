<script lang="ts">
	import type { PackageTable } from '$lib/languages/latex/parser/signatures/packageTable';
	import { preambleFields, spanOf, type PreambleSpan } from '$lib/languages/latex/visual/core/title/preambleFields';
	import { documentTable } from '$lib/languages/latex/visual/core/title/documentTable.svelte';
	import PreambleTitleField from './PreambleTitleField.svelte';

	type Props = { preamble?: string; table?: PackageTable; onEdit?: (span: PreambleSpan, inner: string) => void };
	const props: Props = $props();

	const preamble = $derived(props.preamble ?? '');
	const fields = $derived(preambleFields(preamble, props.table ?? documentTable.current));
</script>

{#each fields as field (field.bodyFrom)}
	<PreambleTitleField
		command={preamble.slice(field.from, field.to)}
		text={preamble.slice(field.bodyFrom, field.bodyTo)}
		span={spanOf(preamble, field)}
		onEdit={(span, text) => props.onEdit?.(span, text)}
	/>
{/each}
