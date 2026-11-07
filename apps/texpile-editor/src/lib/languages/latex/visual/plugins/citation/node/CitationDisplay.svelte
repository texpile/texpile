<script lang="ts">
	import {
		citationText,
		citedWorks,
		inEditorPane,
		referenceStore,
		splitCitationKeys,
		templateFeaturesStore
	} from '$lib/languages/latex/visual/core';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';

	import type { Node as PMNode } from 'prosemirror-model';

	import { aliasCiteForm } from '$lib/languages/latex/knowledge/calls/citeCommands';
	import CitationEditForm from './CitationEditForm.svelte';

	let {
		node = $bindable(),
		onUpdate,
		onChangeKey,
		onClose
	}: {
		node: PMNode;
		onUpdate: (attrs: { prenote?: string; postnote?: string; variant?: string }) => void;
		onChangeKey: (key: string) => void;
		onClose: () => void;
	} = $props();

	let dropdownOpen = $state(false);

	// \cite{a, b, c} is ONE command with a shared note, so it stays one chip; each key resolves
	// on its own and an unresolved one shows as its raw key (the red state says it's broken)
	const displayText = $derived.by(() => {
		const references = referenceStore.current;

		if (!references) return '(loading...)';

		const keys = splitCitationKeys(node.textContent);
		if (!keys.length) return `(${node.textContent} not found)`;

		const works = citedWorks(keys, references, templateFeaturesStore.current.citeAliases);

		const { prenote, postnote, variant } = node.attrs;
		return citationText(String(variant ?? 'cite'), works, String(prenote ?? ''), String(postnote ?? ''));
	});

	const isValid = $derived.by(() => {
		const references = referenceStore.current;
		if (!references) return false;
		const keys = splitCitationKeys(node.textContent);
		const aliases = aliasCiteForm(String(node.attrs.variant ?? 'cite')) ? templateFeaturesStore.current.citeAliases : undefined;
		return keys.length > 0 && keys.every((key) => references.some((ref) => ref.key === key) || (aliases && Object.hasOwn(aliases, key)));
	});

	// preventDefault avoids selection issues
	function handleClick(e: Event) {
		e.preventDefault();
		e.stopPropagation();
		dropdownOpen = !dropdownOpen;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			handleClick(e);
		}
	}
</script>

<Popover
	open={dropdownOpen}
	onOpenChange={(e) => {
		dropdownOpen = e.open;
		if (!e.open) onClose();
	}}
	restoreFocus={false}
	positioning={inEditorPane({ placement: 'bottom-start', offset: { mainAxis: 4 } })}
>
	<!-- a span, as a button never breaks across lines and a long citation must wrap with its text -->
	<Popover.Trigger>
		{#snippet element(attrs)}
			<span
				{...attrs as Record<string, unknown>}
				class="rounded-base cursor-pointer transition-colors"
				class:text-ref-fg={isValid}
				class:bg-ref-bg={isValid && dropdownOpen}
				class:text-ref-broken-fg={!isValid}
				class:hover:bg-ref-bg={isValid}
				class:hover:bg-ref-broken-bg={!isValid}
				role="button"
				tabindex="0"
				onclick={handleClick}
				onkeydown={handleKeydown}>{displayText}</span
			>
		{/snippet}
	</Popover.Trigger>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content
				class="card bg-surface-50-950 border-surface-300-700 z-[200] max-w-[min(90vw,28rem)] min-w-[300px] border p-4 shadow-lg"
			>
				<!-- mounted on open only: the form lists the whole bibliography, and a survey with
				     hundreds of citations kept hundreds of copies of it in the DOM -->
				{#if dropdownOpen}
					<CitationEditForm {node} {onUpdate} {onChangeKey} bind:dropdownOpen />
				{/if}
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
<!-- zero-width space so the cursor can land after the citation -->
<span>&#8203;</span>
