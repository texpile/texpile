<script lang="ts">
	import type { Node as PMNode } from 'prosemirror-model';
	import type { EditorView } from 'prosemirror-view';
	import { AlertCircle, Link2 } from '@lucide/svelte';
	import { refUpdateTrigger } from './refUpdateStore';
	import { refText } from './refText';
	import { sectionNumbers } from '$lib/languages/latex/visual/extensions/label/sectionNumbers';

	let {
		node,
		view,
		updateTrigger = 0
	}: {
		node: PMNode;
		view: EditorView;
		updateTrigger?: number;
	} = $props();

	const label = $derived(node.textContent);

	const refType = $derived(node.attrs?.refType || 'reference');
	const command = $derived(String(node.attrs?.command ?? 'ref'));

	// a standalone \label - the one after a \section - now resolves too, which is what turned
	// "Section sec:bert" into "Section 3.1"
	const sectionNo = $derived.by(() => {
		void updateTrigger;
		void refUpdateTrigger.current;
		return sectionNumbers(view.state.doc).get(label);
	});

	// nothing countable to point at: show the label itself as a neutral chip rather than a number
	// we do not have, and never flag it as missing
	const isGeneral = $derived(refType === 'reference' && sectionNo == null);

	const labelExists = $derived.by(() => {
		// void reads register reactivity on both triggers
		void updateTrigger;
		void refUpdateTrigger.current;

		if (sectionNo != null) return true;

		let exists = false;
		const state = view.state;

		state.doc.descendants((n) => {
			if (refType === 'table' && n.type.name === 'table_wrapper' && n.attrs.label === label) {
				exists = true;
				return false;
			} else if (refType === 'figure' && n.type.name === 'image' && n.attrs.label === label) {
				exists = true;
				return false;
			} else if (refType === 'equation' && n.type.name === 'block_math' && n.attrs.numbered) {
				if (n.attrs.label === label) {
					exists = true;
					return false;
				}
				const lineLabels = (n.attrs.lineLabels as string[]) || [];
				if (lineLabels.includes(label)) {
					exists = true;
					return false;
				}
			}
		});

		return exists;
	});

	const targetNumber = $derived.by(() => {
		void updateTrigger;
		void refUpdateTrigger.current;

		if (sectionNo != null) return sectionNo;
		if (!labelExists) return '?';

		const state = view.state;
		let count = 0;
		let found = false;
		let targetNum = 0;

		state.doc.descendants((n) => {
			if (found) return false;

			if (refType === 'table' && n.type.name === 'table_wrapper') {
				count++;
				if (n.attrs.label === label) {
					targetNum = count;
					found = true;
					return false;
				}
			} else if (refType === 'figure' && n.type.name === 'image') {
				count++;
				if (n.attrs.label === label) {
					targetNum = count;
					found = true;
					return false;
				}
			} else if (refType === 'equation' && n.type.name === 'block_math' && n.attrs.numbered) {
				const lineLabels = (n.attrs.lineLabels as string[]) || [];
				if (lineLabels.length > 0) {
					for (const lineLabel of lineLabels) {
						if (lineLabel && lineLabel.trim()) {
							count++;
							if (lineLabel === label) {
								targetNum = count;
								found = true;
								return false;
							}
						}
					}
				} else if (n.attrs.label) {
					count++;
					if (n.attrs.label === label) {
						targetNum = count;
						found = true;
						return false;
					}
				}
			}
		});

		return targetNum || '?';
	});

	const shown = $derived(refText(command, targetNumber));

	function handleClick(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!labelExists) return;

		const targetElement = view.dom.querySelector(`[data-label="${label}"]`) || view.dom.querySelector(`[imageplugin-label="${label}"]`);
		if (targetElement) {
			targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}
</script>

<button
	type="button"
	class="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-sm font-medium transition-colors"
	class:text-primary-600={isGeneral || labelExists}
	class:bg-primary-50={isGeneral || labelExists}
	class:hover:bg-primary-100={isGeneral || labelExists}
	class:text-error-600={!isGeneral && !labelExists}
	class:bg-error-50={!isGeneral && !labelExists}
	onclick={handleClick}
	title={isGeneral ? `Reference: ${label}` : labelExists ? `Reference to ${label}` : `Label "${label}" not found`}
>
	{#if isGeneral}
		<Link2 class="h-3 w-3" />
		<span>{label}</span>
	{:else if labelExists}
		<Link2 class="h-3 w-3" />
		<span>{shown}</span>
	{:else}
		<AlertCircle class="h-3 w-3" />
		<span>{shown}</span>
	{/if}
</button>
