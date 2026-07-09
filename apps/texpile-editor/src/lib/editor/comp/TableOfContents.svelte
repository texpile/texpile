<script lang="ts">
	import { tocStore, sourceTocStore } from '$lib/editor/extensions/tableofcontents/tocStore';
	import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
	import { TextSelection } from 'prosemirror-state';
	import { EditorView } from '@codemirror/view';

	// source mode reads headings parsed from the raw .tex (char offsets); visual reads the PM plugin's
	let { mode = 'visual' }: { mode?: 'visual' | 'source' } = $props();
	const items = $derived(mode === 'source' ? $sourceTocStore : $tocStore);

	function goTo(pos: number) {
		if (mode === 'source') {
			const view = $sourceCmView;
			if (!view) return;
			const p = Math.min(pos, view.state.doc.length);
			view.dispatch({ selection: { anchor: p }, effects: EditorView.scrollIntoView(p, { y: 'start', yMargin: 20 }) });
			view.focus();
		} else {
			const view = $editorViewStore;
			if (!view) return;
			const sel = TextSelection.near(view.state.doc.resolve(Math.min(pos + 1, view.state.doc.content.size)));
			view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
			view.focus();
		}
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
					class="text-surface-600-300 hover:text-primary-600 block w-full max-w-full truncate rounded-base px-1 py-0.5 text-left transition-colors"
					style="padding-left: {(Math.max(1, item.level) - 1) * 0.7 + 0.25}rem"
					title={item.text}
					onclick={() => goTo(item.pos)}
				>
					{(item.text || 'Untitled').slice(0, 80)}
				</button>
			{/each}
		</div>
	{/if}
</nav>
