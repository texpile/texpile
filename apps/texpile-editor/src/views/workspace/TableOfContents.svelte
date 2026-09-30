<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import {
		tocStore,
		sourceTocStore,
		tocCaretStore,
		activeTocIndex,
		type TocItem,
		type TocList
	} from '$lib/editor/visual/extensions/tableofcontents/tocStore';
	import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
	import { TextSelection } from 'prosemirror-state';
	import { EditorView } from '@codemirror/view';
	import { m } from '$lib/paraglide/messages';

	// source mode reads headings parsed from the raw text (char offsets); visual reads the PM plugin's.
	// A file with neither lists nothing, never the last file's headings.
	// onOpenFile routes clicks on entries merged in from other files (source-mode project outline).
	let { list, onOpenFile }: { list: TocList; onOpenFile?: (file: string, line: number) => void } = $props();
	const items = $derived(list === 'source' ? sourceTocStore.current : list === 'visual' ? tocStore.current : []);
	const emptyText = $derived(list === 'closed' ? m.toc_no_file() : list === 'none' ? m.toc_no_headings_here() : m.toc_empty());
	const active = $derived(activeTocIndex(items, tocCaretStore.current));
	let rows = $state<HTMLButtonElement[]>([]);
	$effect(() => {
		rows[active]?.scrollIntoView?.({ block: 'nearest' });
	});

	function goTo(item: TocItem) {
		if (item.file && onOpenFile) {
			onOpenFile(item.file, item.line ?? 1);
			return;
		}
		if (list === 'source') {
			const view = sourceCmView.current;
			if (!view) return;
			const p = Math.min(item.pos, view.state.doc.length);
			view.dispatch({ selection: { anchor: p }, effects: EditorView.scrollIntoView(p, { y: 'start', yMargin: 20 }) });
			view.focus();
		} else {
			const view = editorViewStore.current;
			if (!view) return;
			const sel = TextSelection.near(view.state.doc.resolve(Math.min(item.pos + 1, view.state.doc.content.size)));
			view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
			view.focus();
		}
	}

	function display(item: TocItem): string {
		const text = (item.text || '').slice(0, 80);
		if (item.kind === 'figure') return `${m.toc_label_figure()} ${item.number ?? ''}${text ? `: ${text}` : ''}`;
		if (item.kind === 'table') return `${m.toc_label_table()} ${item.number ?? ''}${text ? `: ${text}` : ''}`;
		if (item.kind === 'frame') return text || m.toc_label_frame();
		return item.number ? `${item.number}  ${text || m.toc_label_untitled()}` : text || m.toc_label_untitled();
	}
</script>

<nav class="text-sm">
	<div class="text-faint mb-2 text-xs font-semibold tracking-wide uppercase">{m.toc_heading()}</div>
	{#if items.length === 0}
		<p class="text-faint text-xs">{emptyText}</p>
	{:else}
		<div class="flex flex-col gap-0.5">
			{#each items as item, i (i)}
				<button
					type="button"
					class="hover:preset-tonal block w-full max-w-full truncate rounded-base px-1 py-0.5 text-left transition-colors {item.kind
						? 'opacity-80'
						: ''}"
					class:bg-primary-tint={i === active}
					class:font-medium={i === active}
					bind:this={rows[i]}
					style="padding-left: {(Math.max(1, item.level) - 1) * 0.7 + 0.25}rem"
					use:tip={item.text}
					onclick={() => goTo(item)}
				>
					{display(item)}
				</button>
			{/each}
		</div>
	{/if}
</nav>
