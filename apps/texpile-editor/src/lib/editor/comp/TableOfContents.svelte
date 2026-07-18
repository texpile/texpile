<script lang="ts">
	import { tocStore, sourceTocStore, type TocItem } from '$lib/editor/extensions/tableofcontents/tocStore';
	import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
	import { TextSelection } from 'prosemirror-state';
	import { EditorView } from '@codemirror/view';

	// source mode reads headings parsed from the raw .tex (char offsets); visual reads the PM plugin's.
	// onOpenFile routes clicks on entries merged in from other files (source-mode project outline).
	let { mode = 'visual', onOpenFile }: { mode?: 'visual' | 'source'; onOpenFile?: (file: string, line: number) => void } = $props();
	const items = $derived(mode === 'source' ? $sourceTocStore : $tocStore);

	function goTo(item: TocItem) {
		if (item.file && onOpenFile) {
			onOpenFile(item.file, item.line ?? 1);
			return;
		}
		if (mode === 'source') {
			const view = $sourceCmView;
			if (!view) return;
			const p = Math.min(item.pos, view.state.doc.length);
			view.dispatch({ selection: { anchor: p }, effects: EditorView.scrollIntoView(p, { y: 'start', yMargin: 20 }) });
			view.focus();
		} else {
			const view = $editorViewStore;
			if (!view) return;
			const sel = TextSelection.near(view.state.doc.resolve(Math.min(item.pos + 1, view.state.doc.content.size)));
			view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
			view.focus();
		}
	}

	function display(item: TocItem): string {
		const text = (item.text || '').slice(0, 80);
		if (item.kind === 'figure') return `Fig. ${item.number ?? ''}${text ? `: ${text}` : ''}`;
		if (item.kind === 'table') return `Tab. ${item.number ?? ''}${text ? `: ${text}` : ''}`;
		if (item.kind === 'frame') return text || 'Frame';
		return item.number ? `${item.number}  ${text || 'Untitled'}` : text || 'Untitled';
	}
</script>

<nav class="text-sm">
	<div class="text-surface-400 mb-2 text-xs font-semibold tracking-wide uppercase">Contents</div>
	{#if items.length === 0}
		<p class="text-surface-400 text-xs">No headings yet.</p>
	{:else}
		<div class="flex flex-col gap-0.5">
			{#each items as item, i (i)}
				<button
					type="button"
					class="text-surface-600-300 hover:text-primary-600 block w-full max-w-full truncate rounded-base px-1 py-0.5 text-left transition-colors {item.kind
						? 'opacity-80'
						: ''}"
					style="padding-left: {(Math.max(1, item.level) - 1) * 0.7 + 0.25}rem"
					title={item.text}
					onclick={() => goTo(item)}
				>
					{display(item)}
				</button>
			{/each}
		</div>
	{/if}
</nav>
