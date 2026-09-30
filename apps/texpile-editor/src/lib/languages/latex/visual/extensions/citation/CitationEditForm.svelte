<script lang="ts">
	import type { Node as PMNode } from 'prosemirror-model';
	import { templateFeaturesStore } from '$lib/stores/editorStore';
	import { splitCitationKeys } from './citationKeys';
	import CitationReferenceField from '$lib/editor/visual/extensions/citation/CitationReferenceField.svelte';
	import CitationPagesField from '$lib/editor/visual/extensions/citation/CitationPagesField.svelte';
	import { ChevronDown } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		node,
		onUpdate,
		onChangeKey,
		// eslint-disable-next-line no-useless-assignment -- write-only $bindable: the parent reads it
		dropdownOpen = $bindable()
	}: {
		node: PMNode;
		onUpdate: (attrs: Record<string, unknown>) => void;
		onChangeKey?: (key: string) => void;
		dropdownOpen: boolean;
	} = $props();

	const key = $derived(node.textContent);
	const keys = $derived(splitCitationKeys(node.textContent));

	// seeded from the node once by design: the form pushes changes back via the auto-save $effect
	// svelte-ignore state_referenced_locally
	const initialAttrs = node.attrs;
	let postnote = $state(initialAttrs.postnote || '');
	let prenote = $state(initialAttrs.prenote || '');
	let variant = $state(initialAttrs.variant || 'cite');

	let showAdvanced = $state(false);

	let prevValues = $state({
		postnote: initialAttrs.postnote || '',
		prenote: initialAttrs.prenote || '',
		variant: initialAttrs.variant || 'cite'
	});

	let hasMounted = $state(false);

	// one wording per SHAPE, so \citep and \parencite read the same: which of the two a document
	// gets is its bibliography package's business, not something the writer should have to track
	function variantOption(value: string) {
		switch (value) {
			case 'citep':
			case 'parencite':
				return { value, label: m.citation_variant_parenthetical_label(), desc: m.citation_variant_parenthetical_desc() };
			case 'citet':
			case 'textcite':
				return { value, label: m.citation_variant_intext_label(), desc: m.citation_variant_intext_desc() };
			case 'autocite':
				return { value, label: m.citation_variant_automatic_label(), desc: m.citation_variant_automatic_desc() };
			default:
				return { value, label: m.citation_variant_basic_label(), desc: m.citation_variant_basic_desc() };
		}
	}

	// what the open document can compile; no preamble was seen (an included chapter) means we do
	// not know, so nothing is narrowed and the previous list stands
	const offered = $derived(templateFeaturesStore.current?.citationVariants ?? ['autocite', 'parencite', 'textcite', 'cite']);

	// The chip's OWN command is always in the list, even when the document would not offer it now.
	// A <select> bound to a value none of its options carry renders blank, and the first touch
	// would then silently rewrite the command to whichever option happened to be first.
	const variantOptions = $derived((offered.includes(variant) ? offered : [...offered, variant]).map(variantOption));

	const showCitationStyleSelector = $derived(variantOptions.length > 1);

	// auto-save on change
	$effect(() => {
		// skip the initial run so mount doesn't trigger a save
		if (!hasMounted) {
			hasMounted = true;
			return;
		}

		const hasChanges = postnote !== prevValues.postnote || prenote !== prevValues.prenote || variant !== prevValues.variant;

		if (hasChanges) {
			onUpdate({ prenote, postnote, variant });
			prevValues = { postnote, prenote, variant };
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			dropdownOpen = false;
		}
	}
</script>

<div class="citation-edit-form" role="dialog" aria-label={m.citation_dialog_aria_label()} tabindex="-1" onkeydown={handleKeydown}>
	<CitationReferenceField citeKey={key} {keys} {onChangeKey} />

	<CitationPagesField
		bind:value={postnote}
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
			{#if showCitationStyleSelector}
				<label class="block">
					<span class="text-surface-900-100 text-sm font-medium">{m.citation_style_label()}</span>
					<select bind:value={variant} class="input mt-1.5 w-full text-sm">
						{#each variantOptions as opt (opt.value)}
							<option value={opt.value}>
								{opt.label}: {opt.desc}
							</option>
						{/each}
					</select>
				</label>
			{/if}

			<div>
				<span class="text-surface-900-100 mb-1.5 block text-sm font-medium">{m.citation_add_prefix_label()}</span>
				<div class="mb-2 flex flex-wrap gap-2">
					<button type="button" class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal" onclick={() => (prenote = 'see')}>
						see
					</button>
					<button type="button" class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal" onclick={() => (prenote = 'cf.')}>
						cf.
					</button>
					<button type="button" class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal" onclick={() => (prenote = 'compare')}>
						compare
					</button>
				</div>
				<input type="text" bind:value={prenote} placeholder={m.citation_prefix_placeholder()} class="input w-full text-sm" />
				<span class="text-muted mt-1 block text-xs"> {m.citation_prefix_hint()} </span>
			</div>
		</div>
	{/if}
</div>

<style lang="postcss">
	@reference 'tailwindcss';

	.citation-edit-form {
		font-family: inherit;
	}
</style>
