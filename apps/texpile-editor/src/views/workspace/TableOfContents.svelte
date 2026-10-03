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
	import { glideSourceTo, glideVisualTo } from '$lib/editor/visual/extensions/tableofcontents/tocGlide';
	import { m } from '$lib/paraglide/messages';
	import { ChevronDown, ChevronRight } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import {
		tocFoldedNow,
		tocHasChildren,
		tocKeys,
		tocLineage,
		tocShownActive,
		tocVisible
	} from '$lib/editor/visual/extensions/tableofcontents/tocFolding';

	// source mode reads headings parsed from the raw text (char offsets); visual reads the PM plugin's.
	// A file with neither lists nothing, never the last file's headings.
	// onOpenFile routes clicks on entries merged in from other files (source-mode project outline).
	let { list, onOpenFile }: { list: TocList; onOpenFile?: (file: string, line: number) => void } = $props();
	const items = $derived(list === 'source' ? sourceTocStore.current : list === 'visual' ? tocStore.current : []);
	const emptyText = $derived(list === 'closed' ? m.toc_no_file() : list === 'none' ? m.toc_no_headings_here() : m.toc_empty());
	// a section folds by its chevron, as an outline does in other editors; a fold is kept by the heading, not its row
	let folded = $state<ReadonlySet<string>>(new Set());
	const keys = $derived(tocKeys(items));
	const parents = $derived(tocHasChildren(items));
	const caretAt = $derived(activeTocIndex(items, tocCaretStore.current));
	// the caret's sections show open while it is in them, as an outline that follows the cursor does, and fold again
	// once it leaves: the reader's folds are left as they were
	const caretIn = $derived(tocLineage(items, caretAt).map((i) => keys[i]));
	// folded again by the reader with the caret inside, which holds until the caret leaves the section
	let shut = $state<ReadonlySet<string>>(new Set());
	$effect(() => {
		const here = caretIn;
		untrack(() => {
			if ([...shut].some((k) => !here.includes(k))) shut = new Set([...shut].filter((k) => here.includes(k)));
		});
	});
	const foldedNow = $derived(tocFoldedNow(folded, caretIn, shut));
	const visible = $derived(tocVisible(items, keys, foldedNow));
	const active = $derived(tocShownActive(items, visible, caretAt));
	let rows = $state<HTMLButtonElement[]>([]);
	// rows slide open and shut. The scroll waits the slide out: before then it aims at where the row sat while the
	// rows above it were still opening
	const SLIDE_MS = 150;
	// a long outline glides to the caret's row as it moves, unless the reader asked the system for less motion. Drawn
	// anew (the sidebar shut and opened again) it is at that row at once
	let scrolledTo: number | null = null;
	$effect(() => {
		const row = rows[active];
		if (!row) return;
		const moved = scrolledTo !== null && scrolledTo !== active;
		scrolledTo = active;
		if (!moved) return void row.scrollIntoView?.({ block: 'nearest' });
		const settled = setTimeout(() => {
			const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
			row.scrollIntoView?.({ block: 'nearest', behavior });
		}, SLIDE_MS);
		return () => clearTimeout(settled);
	});

	// a click leaves the reader's own fold as the row now shows
	function toggle(key: string) {
		if (foldedNow.has(key)) {
			folded = new Set([...folded].filter((k) => k !== key));
			shut = new Set([...shut].filter((k) => k !== key));
		} else {
			folded = new Set([...folded, key]);
			if (caretIn.includes(key)) shut = new Set([...shut, key]);
		}
	}

	function goTo(item: TocItem) {
		if (item.file && onOpenFile) {
			onOpenFile(item.file, item.line ?? 1);
			return;
		}
		if (list === 'source') {
			const view = sourceCmView.current;
			if (!view) return;
			const p = Math.min(item.pos, view.state.doc.length);
			// the caret first: a heading inside a fold opens, and there is something to glide to
			view.dispatch({ selection: { anchor: p } });
			glideSourceTo(view, p);
			view.focus();
		} else {
			const view = editorViewStore.current;
			if (!view) return;
			const sel = TextSelection.near(view.state.doc.resolve(Math.min(item.pos + 1, view.state.doc.content.size)));
			view.dispatch(view.state.tr.setSelection(sel));
			glideVisualTo(view, item.pos);
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
		<!-- space between rows as margins, not gap: a slide takes a row's margin with it, a gap would snap at the end -->
		<div class="flex flex-col space-y-0.5">
			{#each items as item, i (i)}
				{#if visible[i]}
					<!-- the chevron's slot is kept on every row, so a heading's text lines up whether it folds or not -->
					<div
						transition:slide={{ duration: SLIDE_MS }}
						class="hover:preset-tonal flex w-full max-w-full items-center rounded-base transition-colors {item.kind ? 'opacity-80' : ''}"
						class:bg-primary-tint={i === active}
						style="padding-left: {(Math.max(1, item.level) - 1) * 0.7}rem"
					>
						{#if parents[i]}
							<button
								type="button"
								class="text-muted hover:text-surface-950-50 flex size-4 shrink-0 items-center justify-center"
								aria-expanded={!foldedNow.has(keys[i])}
								aria-label={item.text}
								onclick={() => toggle(keys[i])}
							>
								{#if foldedNow.has(keys[i])}<ChevronRight class="size-3.5" />{:else}<ChevronDown class="size-3.5" />{/if}
							</button>
						{:else}
							<span class="size-4 shrink-0"></span>
						{/if}
						<button
							type="button"
							class="min-w-0 flex-1 truncate py-0.5 pr-1 pl-0.5 text-left"
							class:font-medium={i === active}
							bind:this={rows[i]}
							use:tip={item.text}
							onclick={() => goTo(item)}
						>
							{display(item)}
						</button>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</nav>
