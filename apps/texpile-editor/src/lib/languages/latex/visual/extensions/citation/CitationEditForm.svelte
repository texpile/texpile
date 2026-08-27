<script lang="ts">
	import type { Node as PMNode } from 'prosemirror-model';
	import { referenceStore, templateFeaturesStore } from '$lib/stores/editorStore';
	import { citationRefsWithLibrary } from '$lib/library/libraryRefs';
	import { splitCitationKeys } from './citationKeys';
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
	// project refs plus the personal library, so a library-only key still displays and offers
	// its entry in the key dropdown
	const allRefs = $derived(citationRefsWithLibrary(referenceStore.current ?? []));
	const reference = $derived(allRefs.find((ref) => ref.key === key));

	// dropdown label, capped so long titles don't blow out the select
	function refLabel(ref: { author?: string | string[]; year?: string; title?: string; key?: string }): string {
		const author = Array.isArray(ref.author) ? ref.author.join(', ') : ref.author;
		let s = author || ref.key || '';
		if (ref.year) s += ` (${ref.year})`;
		if (ref.title) s += `: ${ref.title}`;
		return s.length > 70 ? s.slice(0, 69).trimEnd() + '…' : s;
	}

	// seeded from the node once by design: the form pushes changes back via the auto-save $effect
	// svelte-ignore state_referenced_locally
	const initialAttrs = node.attrs;
	let postnote = $state(initialAttrs.postnote || '');
	let prenote = $state(initialAttrs.prenote || '');
	let variant = $state(initialAttrs.variant || 'autocite');

	let showAdvanced = $state(false);

	let prevValues = $state({
		postnote: initialAttrs.postnote || '',
		prenote: initialAttrs.prenote || '',
		variant: initialAttrs.variant || 'autocite'
	});

	let hasMounted = $state(false);

	const defaultVariantOptions = [
		{ value: 'autocite', label: m.citation_variant_automatic_label(), desc: m.citation_variant_automatic_desc() },
		{ value: 'parencite', label: m.citation_variant_parenthetical_label(), desc: m.citation_variant_parenthetical_desc() },
		{ value: 'textcite', label: m.citation_variant_intext_label(), desc: m.citation_variant_intext_desc() },
		{ value: 'cite', label: m.citation_variant_basic_label(), desc: m.citation_variant_basic_desc() }
	];

	const variantOptions = $derived(
		templateFeaturesStore.current?.citationVariants?.length ? templateFeaturesStore.current.citationVariants : defaultVariantOptions
	);

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
	<div class="border-surface-300-700 mb-4 border-b pb-3">
		{#if keys.length > 1}
			<!-- a multi-key cite: swapping through the single-key select would silently collapse it
			     to one key, so the group is listed read-only; the shared notes below stay editable -->
			<span class="text-surface-900-100 text-sm font-medium">{m.citation_reference_label()}</span>
			{#each keys as k (k)}
				{@const ref = allRefs.find((r) => r.key === k)}
				<div class="mt-1.5">
					<span class="text-surface-900-100 text-sm font-semibold">{ref?.author || k}</span>
					<span class="text-surface-600-400 text-sm">{ref ? ref.year || ref.date?.slice(0, 4) || '' : m.citation_key_missing()}</span>
				</div>
			{/each}
		{:else if onChangeKey && allRefs.length}
			<span class="text-surface-900-100 text-sm font-medium">{m.citation_reference_label()}</span>
			<select class="input mt-1.5 w-full text-sm" value={key} onchange={(e) => onChangeKey?.((e.currentTarget as HTMLSelectElement).value)}>
				{#if !reference}<option value={key}>{m.citation_ref_not_found({ key })}</option>{/if}
				{#each allRefs as ref (ref.key)}
					<option value={ref.key} title={ref.title || ref.key}>{refLabel(ref)}</option>
				{/each}
			</select>
		{:else}
			<div class="text-surface-900-100 text-base font-semibold">{reference?.author || m.citation_unknown_author()}</div>
			<div class="text-surface-600-400 text-sm">
				{reference?.year || m.citation_year_na()}
				{#if reference?.title}<span class="mt-1 block text-xs italic">{reference.title}</span>{/if}
			</div>
		{/if}
	</div>

	<label class="mb-4 block">
		<span class="text-surface-900-100 text-sm font-medium">{m.citation_page_numbers_label()}</span>
		<span class="text-surface-500-400 ml-1 text-xs">{m.citation_optional()}</span>
		<input type="text" bind:value={postnote} placeholder={m.citation_page_numbers_placeholder()} class="input mt-1.5 w-full" />
		<span class="text-surface-500-400 mt-1 block text-xs"> {m.citation_page_numbers_hint()} </span>
	</label>

	<button
		type="button"
		class="text-surface-600-400 hover:text-surface-900-100 mb-3 flex w-full items-center gap-2 text-sm transition-colors"
		onclick={() => (showAdvanced = !showAdvanced)}
	>
		<ChevronDown class="h-4 w-4 transition-transform {showAdvanced ? 'rotate-180' : ''}" />
		<span>{m.citation_advanced_options()}</span>
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
					<button type="button" class="btn btn-xs preset-outlined-primary-500" onclick={() => (prenote = 'see')}> see </button>
					<button type="button" class="btn btn-xs preset-outlined-primary-500" onclick={() => (prenote = 'cf.')}> cf. </button>
					<button type="button" class="btn btn-xs preset-outlined-primary-500" onclick={() => (prenote = 'compare')}> compare </button>
				</div>
				<input type="text" bind:value={prenote} placeholder={m.citation_prefix_placeholder()} class="input w-full text-sm" />
				<span class="text-surface-500-400 mt-1 block text-xs"> {m.citation_prefix_hint()} </span>
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
