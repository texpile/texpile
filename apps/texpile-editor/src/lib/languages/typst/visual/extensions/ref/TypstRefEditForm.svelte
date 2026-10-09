<script lang="ts">
	import type { Node as PMNode } from 'prosemirror-model';
	import { ChevronDown } from '@lucide/svelte';
	import { referenceStore } from '$lib/stores/editorStore';
	import CitationReferenceField from '$lib/editor/visual/extensions/citation/CitationReferenceField.svelte';
	import CitationPagesField from '$lib/editor/visual/extensions/citation/CitationPagesField.svelte';
	import { AUTO_FORM, citeFormOptions } from './citeForms';
	import { supplementFromField } from './refSupplement';
	import { m } from '$lib/paraglide/messages';

	let {
		node,
		onUpdate,
		onChangeKey,
		// eslint-disable-next-line no-useless-assignment, @typescript-eslint/no-unused-vars -- write-only $bindable: the parent reads it
		dropdownOpen = $bindable()
	}: {
		node: PMNode;
		onUpdate: (attrs: Record<string, unknown>) => void;
		onChangeKey: (key: string) => void;
		dropdownOpen: boolean;
	} = $props();

	const target = $derived(String(node.attrs.target ?? ''));
	// a key the bibliography holds, or one the file cites by call, is a citation; anything else is a label
	const isCitation = $derived(node.attrs.form != null || !!referenceStore.current?.some((r) => r.key === target));
	const form = $derived(typeof node.attrs.form === 'string' ? node.attrs.form : null);
	const formOptions = $derived(citeFormOptions(form));

	// seeded from the node once by design: the field pushes its changes back through the $effect below
	// svelte-ignore state_referenced_locally
	const initialSupplement = typeof node.attrs.supplement === 'string' ? node.attrs.supplement : '';
	let supplement = $state(initialSupplement);
	let written = initialSupplement;
	let showAdvanced = $state(false);

	$effect(() => {
		if (supplement === written) return;
		written = supplement;
		onUpdate({ supplement: supplementFromField(supplement) });
	});

	function chooseForm(value: string) {
		const next = value === AUTO_FORM ? null : value;
		if (next !== form) onUpdate({ form: next });
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			dropdownOpen = false;
		}
	}
</script>

<div class="citation-edit-form" role="dialog" aria-label={m.citation_dialog_aria_label()} tabindex="-1" onkeydown={handleKeydown}>
	{#if isCitation}
		<CitationReferenceField citeKey={target} keys={[target]} {onChangeKey} />
		<CitationPagesField
			bind:value={supplement}
			label={m.citation_page_numbers_label()}
			placeholder={m.citation_page_numbers_placeholder()}
			hint={m.citation_page_numbers_hint()}
		/>

		<button
			type="button"
			class="text-muted hover:text-surface-900-100 mb-3 flex w-full items-center gap-2 text-sm transition-colors"
			onclick={() => (showAdvanced = !showAdvanced)}
		>
			<ChevronDown class="h-4 w-4 transition-transform {showAdvanced ? 'rotate-180' : ''}" />
			<span class="cap-center">{m.citation_advanced_options()}</span>
		</button>

		{#if showAdvanced}
			<div class="border-surface-300-700 mb-3 space-y-4 pl-6">
				<label class="block">
					<span class="text-surface-900-100 text-sm font-medium">{m.citation_style_label()}</span>
					<select
						value={form ?? AUTO_FORM}
						class="input mt-1.5 w-full text-sm"
						onchange={(e) => chooseForm((e.currentTarget as HTMLSelectElement).value)}
					>
						{#each formOptions as opt (opt.value)}
							<option value={opt.value}>{opt.label}: {opt.desc}</option>
						{/each}
					</select>
				</label>
			</div>
		{/if}
	{:else}
		<div class="border-surface-300-700 mb-4 border-b pb-3">
			<span class="text-surface-900-100 text-sm font-medium">{m.citation_label_reference()}</span>
			<div class="text-surface-900-100 mt-1.5 font-mono text-sm">@{target}</div>
		</div>
		<CitationPagesField
			bind:value={supplement}
			label={m.citation_supplement_label()}
			placeholder={m.citation_supplement_placeholder()}
			hint={m.citation_supplement_hint()}
		/>
	{/if}
</div>
