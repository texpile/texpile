<script lang="ts">
	// the top of a citation editor: which work is cited, and a picker to cite another one instead
	import { referenceStore } from '$lib/stores/editorStore';
	import { bibDisplayText, bibAuthorShort } from '$lib/languages/bib/biblatex';
	import { citationReferenceLabel } from './citationReferenceLabel';
	import { m } from '$lib/paraglide/messages';

	let {
		citeKey,
		keys,
		onChangeKey
	}: {
		/** the key as the citation holds it */
		citeKey: string;
		/** every key it cites; more than one is shown, not picked */
		keys: string[];
		onChangeKey?: (key: string) => void;
	} = $props();

	const reference = $derived(referenceStore.current?.find((ref) => ref.key === citeKey));
</script>

<div class="border-surface-300-700 mb-4 border-b pb-3">
	{#if keys.length > 1}
		<!-- a multi-key cite: swapping through the single-key select would silently collapse it
		     to one key, so the group is listed read-only; the shared notes below stay editable -->
		<span class="text-surface-900-100 text-sm font-medium">{m.citation_reference_label()}</span>
		{#each keys as k (k)}
			{@const ref = referenceStore.current?.find((r) => r.key === k)}
			<div class="mt-1.5 text-sm">
				{#if ref}
					<span class="text-surface-900-100">{citationReferenceLabel(ref)}</span>
				{:else}
					<span class="text-surface-900-100 font-mono">{k}</span>
					<span class="text-muted">{m.citation_key_missing()}</span>
				{/if}
			</div>
		{/each}
	{:else if onChangeKey && referenceStore.current?.length}
		<span class="text-surface-900-100 text-sm font-medium">{m.citation_reference_label()}</span>
		<select
			class="select mt-1.5 w-full text-sm"
			value={citeKey}
			onchange={(e) => onChangeKey?.((e.currentTarget as HTMLSelectElement).value)}
		>
			{#if !reference}<option value={citeKey}>{m.citation_ref_not_found({ key: citeKey })}</option>{/if}
			{#each referenceStore.current as ref (ref.key)}
				<option value={ref.key} title={ref.title || ref.key}>{citationReferenceLabel(ref)}</option>
			{/each}
		</select>
	{:else}
		<div class="text-surface-900-100 text-base font-semibold">{bibAuthorShort(reference?.author) || m.citation_unknown_author()}</div>
		<div class="text-muted text-sm">
			{reference?.year || m.citation_year_na()}
			{#if reference?.title}<span class="mt-1 block text-xs italic">{bibDisplayText(reference.title)}</span>{/if}
		</div>
	{/if}
</div>
