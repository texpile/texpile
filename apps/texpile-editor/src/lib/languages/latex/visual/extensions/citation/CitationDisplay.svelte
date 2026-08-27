<script lang="ts">
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { Node as PMNode } from 'prosemirror-model';
	import { referenceStore } from '$lib/stores/editorStore';
	import { citationRefsWithLibrary } from '$lib/library/libraryRefs';
	import { splitCitationKeys } from './citationKeys';
	import CitationEditForm from './CitationEditForm.svelte';

	let {
		node = $bindable(),
		onUpdate,
		onChangeKey
	}: {
		node: PMNode;
		onUpdate: (attrs: { prenote?: string; postnote?: string; variant?: string }) => void;
		onChangeKey: (key: string) => void;
	} = $props();

	let dropdownOpen = $state(false);

	// \cite{a, b, c} is ONE command with a shared note, so it stays one chip; each key resolves
	// on its own and an unresolved one shows as its raw key (the red state says it's broken)
	const displayText = $derived.by(() => {
		const loaded = referenceStore.current;
		const references = citationRefsWithLibrary(loaded ?? []);

		if (!loaded) return '(loading...)';

		const keys = splitCitationKeys(node.textContent);
		if (!keys.length) return `(${node.textContent} not found)`;

		const text = keys
			.map((key) => {
				const reference = references.find((ref) => ref.key === key);
				if (!reference) return keys.length === 1 ? `${key} not found` : key;
				return `${reference.author} ${reference.year || reference.date?.slice(0, 4) || 'n.d.'}`;
			})
			.join('; ');

		const { prenote, postnote } = node.attrs;
		if (prenote && postnote) return `(${prenote}, ${text}, ${postnote})`;
		if (prenote) return `(${prenote}, ${text})`;
		if (postnote) return `(${text}, ${postnote})`;
		return `(${text})`;
	});

	const isValid = $derived.by(() => {
		const loaded = referenceStore.current;
		if (!loaded) return false;
		const references = citationRefsWithLibrary(loaded);
		const keys = splitCitationKeys(node.textContent);
		return keys.length > 0 && keys.every((key) => references.some((ref) => ref.key === key));
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
	onOpenChange={(e) => (dropdownOpen = e.open)}
	positioning={{ placement: 'bottom-start', offset: { mainAxis: 4 } }}
>
	<Popover.Trigger class="inline-flex cursor-pointer items-center" style="font-size: 1rem;">
		<span
			class="rounded py-0.5 transition-colors"
			class:text-blue-600={isValid}
			class:dark:text-blue-400={isValid}
			class:bg-blue-50={isValid && dropdownOpen}
			class:dark:bg-blue-950={isValid && dropdownOpen}
			class:text-red-600={!isValid}
			class:dark:text-red-400={!isValid}
			class:hover:bg-blue-50={isValid}
			class:dark:hover:bg-blue-950={isValid}
			class:hover:bg-red-50={!isValid}
			class:dark:hover:bg-red-950={!isValid}
			role="button"
			tabindex="0"
			onclick={handleClick}
			onkeydown={handleKeydown}
		>
			{displayText}
		</span>
	</Popover.Trigger>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 border-surface-300-700 z-[200] min-w-[300px] border p-4 shadow-lg">
				<CitationEditForm {node} {onUpdate} {onChangeKey} bind:dropdownOpen />
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
<!-- zero-width space so the cursor can land after the citation -->
<span style="font-size: 1rem;">&#8203;</span>
