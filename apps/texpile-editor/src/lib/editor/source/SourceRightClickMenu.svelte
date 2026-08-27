<script lang="ts">
	import type { EditorView as CMView } from '@codemirror/view';
	import { selectAll } from '@codemirror/commands';
	import { openSearchPanel } from '@codemirror/search';
	import { ArrowRight, BookMarked, Library, Scissors, Copy, ClipboardPaste, Search, MessageSquarePlus } from '@lucide/svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { copySelection, cutSelection, pasteAtCursor } from '$lib/editor/source/cmClipboardUtils';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		onSyncToPdf?: (line: number) => void;
		onAddComment?: (from: number, to: number) => void;
		// Zotero Citation
		onInsertCitation?: () => void;
		// personal library citation
		onInsertLibraryCitation?: () => void;
		// preview = not pdfviewer
		syncTarget?: 'pdf' | 'preview';
	};
	let { onSyncToPdf, onAddComment, onInsertCitation, onInsertLibraryCitation, syncTarget = 'pdf' }: Props = $props();

	/** where the menu was opened, and what the editor could act on there */
	type SelectonTarget = {
		x: number;
		y: number;
		line: number;
		selection: { from: number; to: number } | null;
	};
	let target = $state<SelectonTarget | null>(null);

	let view: CMView | null = null;

	// open at pointer
	export function open(event: MouseEvent, on: CMView): void {
		event.preventDefault();
		const pos = on.posAtCoords({ x: event.clientX, y: event.clientY });
		const main = on.state.selection.main;
		view = on;
		target = {
			// clamping to prevent menu go off screen
			x: Math.min(event.clientX, window.innerWidth - 210),
			y: Math.min(event.clientY, window.innerHeight - 240),
			line: on.state.doc.lineAt(pos ?? main.head).number,
			selection: main.empty ? null : { from: main.from, to: main.to }
		};
	}

	export function close(): void {
		target = null;
	}

	function runCommands(run: (view: CMView, at: SelectonTarget) => void) {
		return () => {
			if (view && target) run(view, target);
			close();
		};
	}

	const itemClass =
		'hover:preset-tonal-primary flex w-full items-center gap-2.5 px-3 py-1 text-left disabled:pointer-events-none disabled:opacity-40';
</script>

<svelte:window onkeydown={(e) => target && e.key === 'Escape' && close()} />

{#if target}
	<button
		class="fixed inset-0 z-40 cursor-default"
		aria-label={m.tbar_close_menu_aria()}
		onclick={close}
		oncontextmenu={(e) => (e.preventDefault(), close())}
	></button>
	<div
		class="bg-surface-50-950 border-surface-300-700 fixed z-50 min-w-48 overflow-hidden rounded border py-1 text-sm shadow-lg"
		style="left: {target.x}px; top: {target.y}px"
	>
		<button class={itemClass} disabled={!target.selection} onclick={runCommands(cutSelection)}>
			<Scissors class="size-4 opacity-70" />
			{m.tbar_ctx_cut()}
			<Kbd keys="Mod+X" class="ml-auto" />
		</button>
		<button class={itemClass} disabled={!target.selection} onclick={runCommands(copySelection)}>
			<Copy class="size-4 opacity-70" />
			{m.tbar_ctx_copy()}
			<Kbd keys="Mod+C" class="ml-auto" />
		</button>
		<button class={itemClass} onclick={runCommands(pasteAtCursor)}>
			<ClipboardPaste class="size-4 opacity-70" />
			{m.tbar_ctx_paste()}
			<Kbd keys="Mod+V" class="ml-auto" />
		</button>
		<button
			class={itemClass}
			onclick={runCommands((v) => {
				selectAll(v);
				v.focus();
			})}
		>
			<span class="size-4 shrink-0"></span>
			{m.tbar_ctx_select_all()}
			<Kbd keys="Mod+A" class="ml-auto" />
		</button>
		{#if onAddComment}
			<!-- the same gesture the margin pill offers, for people who reach for the menu instead;
			     disabled rather than hidden with nothing selected, so it is discoverable -->
			<div class="border-surface-200-800 my-1 border-t"></div>
			<button
				class={itemClass}
				disabled={!target.selection}
				onclick={runCommands((_v, at) => at.selection && onAddComment(at.selection.from, at.selection.to))}
			>
				<MessageSquarePlus class="size-4 opacity-70" />
				{m.comments_add()}
			</button>
		{/if}
		{#if onInsertCitation}
			<div class="border-surface-200-800 my-1 border-t"></div>
			<button class={itemClass} onclick={runCommands(() => onInsertCitation())}>
				<BookMarked class="size-4 opacity-70" />
				{m.zotero_insert_citation()}
			</button>
		{/if}
		{#if onInsertLibraryCitation}
			<button class={itemClass} onclick={runCommands(() => onInsertLibraryCitation())}>
				<Library class="size-4 opacity-70" />
				{m.library_insert_citation()}
			</button>
		{/if}
		<div class="border-surface-200-800 my-1 border-t"></div>
		<button class={itemClass} onclick={runCommands(openSearchPanel)}>
			<Search class="size-4 opacity-70" />
			{m.tbar_ctx_find()}
			<Kbd keys="Mod+F" class="ml-auto" />
		</button>
		{#if onSyncToPdf}
			<div class="border-surface-200-800 my-1 border-t"></div>
			<button class={itemClass} onclick={runCommands((_v, at) => onSyncToPdf(at.line))}>
				<ArrowRight class="size-4 opacity-70" />
				{syncTarget === 'preview' ? m.tbar_ctx_show_in_preview() : m.tbar_ctx_show_in_pdf()}
			</button>
		{/if}
	</div>
{/if}
