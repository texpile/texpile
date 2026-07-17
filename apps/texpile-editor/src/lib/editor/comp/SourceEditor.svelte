<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, drawSelection, lineNumbers, highlightActiveLine } from '@codemirror/view';
	import { EditorState, Compartment, Transaction } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { bracketMatching, indentOnInput, LanguageDescription } from '@codemirror/language';
	import { cmSyntaxHighlight } from '$lib/editor/cmHighlight';
	import { languages as cmlangdata } from '@codemirror/language-data';
	import { searchKeymap, openSearchPanel } from '@codemirror/search';
	import { texpileSearch } from '$lib/editor/extensions/search-panel/searchPanel';
	import { latexAutocomplete, latexIntellisense } from '$lib/editor/extensions/intellisense/intellisense';
	import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
	import { mathPreview } from '$lib/editor/extensions/math-preview/mathPreview';
	import { starterGhost } from '$lib/editor/extensions/starter-ghost/starterGhost';
	import { synctexFlash, flashLineEffect } from '$lib/editor/extensions/synctex-flash/synctexFlash';
	import { bibtex } from '$lib/editor/extensions/bibtex/bibtex';
	import { sourceCmView } from '$lib/stores/editorStore';
	import { setSourceDocCount, setSourceSelectionCount } from '$lib/stores/countStore.svelte';

	// full-file CodeMirror editor. source-mode edits are written back verbatim, never through the
	// parse/serialize round-trip. filename picks the syntax mode, defaulting to LaTeX.
	import { LocateFixed, Scissors, Copy, ClipboardPaste, Search } from '@lucide/svelte';

	// gotoLine: token makes repeat jumps to the same line re-fire; selectText anchors against line drift.
	// initialScrollPos: one-shot mode-switch sync applied at mount.
	// onHistoryBoundary: called when CM undo/redo is exhausted; return true if the workspace history handled it.
	// diagnostics: compile-log problems for this file, line-anchored (the log gives no columns).
	interface SourceDiagnostic {
		line: number;
		lineEnd?: number;
		severity: 'error' | 'warning' | 'info';
		message: string;
	}
	let {
		value = '',
		onInput,
		filename = '',
		gotoLine,
		onSyncToPdf,
		initialScrollPos = null,
		onHistoryBoundary,
		diagnostics = []
	}: {
		value?: string;
		onInput?: (v: string) => void;
		filename?: string;
		gotoLine?: { line: number; token: number; selectText?: string };
		onSyncToPdf?: (line: number) => void;
		initialScrollPos?: { scroll: number | null; cursor: number | null } | null;
		onHistoryBoundary?: (dir: 'undo' | 'redo') => boolean;
		diagnostics?: SourceDiagnostic[];
	} = $props();

	let ctxMenu = $state<{ x: number; y: number; line: number; hasSelection: boolean } | null>(null);
	function onContextMenu(e: MouseEvent) {
		if (!view) return;
		e.preventDefault();
		const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
		const line = view.state.doc.lineAt(pos ?? view.state.selection.main.head).number;
		const main = view.state.selection.main;
		ctxMenu = {
			x: Math.min(e.clientX, window.innerWidth - 210),
			y: Math.min(e.clientY, window.innerHeight - 240),
			line,
			hasSelection: !main.empty
		};
	}
	function closeMenu() {
		ctxMenu = null;
	}
	const itemClass =
		'hover:preset-tonal-primary flex w-full items-center gap-2.5 px-3 py-1 text-left disabled:pointer-events-none disabled:opacity-40';
	async function cmCopy() {
		if (!view) return;
		const m = view.state.selection.main;
		const text = view.state.sliceDoc(m.from, m.to);
		if (text) await navigator.clipboard.writeText(text).catch(() => {});
	}
	async function cmCut() {
		if (!view) return;
		const { from, to } = view.state.selection.main;
		const text = view.state.sliceDoc(from, to);
		if (text) {
			await navigator.clipboard.writeText(text).catch(() => {});
			view.dispatch({ changes: { from, to, insert: '' } });
		}
		view.focus();
	}
	async function cmPaste() {
		if (!view) return;
		const text = await navigator.clipboard.readText().catch(() => '');
		if (!text) {
			view.focus();
			return;
		}
		const { from, to } = view.state.selection.main;
		view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
		view.focus();
	}
	function cmSelectAll() {
		if (!view) return;
		view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
		view.focus();
	}
	function cmFind() {
		if (view) openSearchPanel(view);
	}

	let host = $state<HTMLDivElement>();
	let view: EditorView | null = null;
	// three digits so the text stops shifting every power of ten. the element is border-box, so the
	// padding has to be inside the floor or it eats a digit.
	const gutterTheme = EditorView.theme({
		// gutters aren't content: without this, double-clicking a line number or a fold arrow selects it
		'.cm-gutters': { userSelect: 'none', WebkitUserSelect: 'none' },
		'.cm-lineNumbers .cm-gutterElement': {
			padding: '0 3px 0 5px',
			minWidth: 'calc(3ch + 3px + 5px)',
			textAlign: 'center'
		},
		'.cm-gutter-lint': { width: '1em' },
		'.cm-gutter-lint .cm-gutterElement': { padding: '0 1px' },
		'.cm-lint-marker': { width: '0.8em', height: '0.8em' }
	});
	const langConf = new Compartment();
	// true while pushing an external value into CM, so the update listener doesn't echo it back as a user edit
	let syncing = false;

	onMount(() => {
		view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: value,
				extensions: [
					// gutters render in extension order: lint goes before lineNumbers so it lands on their left
					...(!filename || /\.tex$/i.test(filename) ? [lintGutter({ hoverTime: 0 })] : []),
					lineNumbers(),
					gutterTheme,
					highlightActiveLine(),
					history(),
					drawSelection(),
					bracketMatching(),
					indentOnInput(),
					langConf.of([]),
					cmSyntaxHighlight(),
					// full intellisense (completion + shortcuts + hover + folding + go-to-def) + math preview for
					// .tex only; .bib gets entry-type/field completion
					...(!filename || /\.tex$/i.test(filename)
						? [latexIntellisense(), mathPreview(), starterGhost()]
						: /\.bib$/i.test(filename)
							? [latexAutocomplete({ bib: true })]
							: []),
					synctexFlash(), // flash the line jumped to by SyncTeX inverse search / Find-in-Files
					// compact find/replace widget, floated top-right (styles below)
					texpileSearch(),
					keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
					// lower precedence than historyKeymap, so CM's own undo/redo runs first; these fire only
					// when it's exhausted and the workspace snapshot history takes over. consume the key even
					// at the stack edge: a failed redo falling through to another binding is worse than a no-op.
					keymap.of([
						{ key: 'Mod-z', run: () => (onHistoryBoundary ? (onHistoryBoundary('undo'), true) : false) },
						{ key: 'Mod-y', run: () => (onHistoryBoundary ? (onHistoryBoundary('redo'), true) : false) },
						{ key: 'Mod-Shift-z', run: () => (onHistoryBoundary ? (onHistoryBoundary('redo'), true) : false) }
					]),
					EditorView.lineWrapping,
					EditorView.contentAttributes.of({ spellcheck: 'false', 'data-gramm': 'false', 'data-enable-grammarly': 'false' }),
					EditorView.updateListener.of((u) => {
						if (u.docChanged) {
							const text = u.state.doc.toString();
							if (!syncing) onInput?.(text);
							setSourceDocCount(text); // live word/char count in source mode
						}
						if (u.docChanged || u.selectionSet) {
							const s = u.state.selection.main;
							setSourceSelectionCount(s.empty ? null : u.state.sliceDoc(s.from, s.to));
						}
					})
				]
			})
		});
		view.focus();
		// seed the counts now; the updateListener only fires on later changes
		setSourceDocCount(view.state.doc.toString());
		setSourceSelectionCount(null);
		// mode-switch sync: reveal the scroll offset near the top, park the caret at the
		// visual editor's caret and flash its line
		if (initialScrollPos != null) {
			const len = view.state.doc.length;
			const clamp = (p: number) => Math.min(Math.max(0, p), len);
			const scrollPos = initialScrollPos.scroll != null ? clamp(initialScrollPos.scroll) : null;
			const cursorPos = initialScrollPos.cursor != null ? clamp(initialScrollPos.cursor) : scrollPos;
			if (cursorPos != null) {
				view.dispatch({
					selection: { anchor: cursorPos },
					effects: [flashLineEffect.of(cursorPos), EditorView.scrollIntoView(scrollPos ?? cursorPos, { y: 'start', yMargin: 12 })]
				});
			}
		}
		// publish this CM as the source-mode editor so menuBarCommands can route Insert/Format to it
		sourceCmView.set(view);

		// .bib uses our hand-written highlighter (language-data ships none). language-data's LaTeX
		// descriptor only matches .tex/.ltx, so route .cls/.sty (same TeX syntax) to it directly
		// instead of through matchFilename, which would leave them unhighlighted.
		if (filename && /\.bib$/i.test(filename)) {
			view?.dispatch({ effects: langConf.reconfigure(bibtex()) });
		} else {
			const desc =
				!filename || /\.(tex|cls|sty)$/i.test(filename)
					? cmlangdata.find((l) => l.name === 'LaTeX')
					: LanguageDescription.matchFilename(cmlangdata, filename);
			desc?.load().then((lang) => view?.dispatch({ effects: langConf.reconfigure(lang) }));
		}
	});

	// replace the document on external value changes without echoing. addToHistory(false) keeps the
	// replacement out of CM's undo stack, otherwise the next Ctrl+Z would "undo the undo" and bounce back.
	$effect(() => {
		const v = value;
		if (view && v !== view.state.doc.toString()) {
			syncing = true;
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: v },
				annotations: Transaction.addToHistory.of(false)
			});
			syncing = false;
		}
	});

	// the log names lines, not columns, so each diagnostic spans its whole line (clamped, the buffer
	// may have drifted). declared after the value-sync effect so a same-flush file switch replaces
	// the document first and the diagnostics anchor on the fresh doc.
	$effect(() => {
		const list = diagnostics;
		const v = view;
		void value; // re-anchor when the document is externally replaced
		if (!v) return;
		const doc = v.state.doc;
		const mapped: Diagnostic[] = list
			.filter((d) => Number.isInteger(d.line) && d.line >= 1)
			.map((d) => {
				const from = doc.line(Math.min(d.line, doc.lines)).from;
				const to = doc.line(Math.min(d.lineEnd ?? d.line, doc.lines)).to;
				return { from, to: Math.max(to, from), severity: d.severity, message: d.message, source: 'latex' };
			});
		v.dispatch(setDiagnostics(v.state, mapped));
	});

	// SyncTeX gives only a line number, which is stale whenever the buffer differs from the compiled
	// .tex. when the double-clicked word is known, anchor on content instead: select it on the
	// reported line, else on the nearest line containing it. this is what survives line drift.
	function resolveTarget(doc: EditorState['doc'], req: { line: number; selectText?: string }): { from: number; to: number } {
		const line = Math.min(Math.max(1, Math.floor(req.line)), doc.lines);
		const word = req.selectText?.trim();
		if (word && word.length >= 2) {
			const here = doc.line(line);
			const at = here.text.indexOf(word);
			if (at !== -1) return { from: here.from + at, to: here.from + at + word.length };
			// line drifted, find every line containing the word
			const hits: { line: number; from: number }[] = [];
			for (let i = 1; i <= doc.lines; i++) {
				const l = doc.line(i);
				const idx = l.text.indexOf(word);
				if (idx !== -1) hits.push({ line: i, from: l.from + idx });
			}
			if (hits.length === 1) return { from: hits[0].from, to: hits[0].from + word.length }; // unique -> certain
			if (hits.length > 1) {
				const best = hits.reduce((b, h) => (Math.abs(h.line - line) < Math.abs(b.line - line) ? h : b));
				return { from: best.from, to: best.from + word.length };
			}
		}
		const pos = doc.line(line).from;
		return { from: pos, to: pos };
	}
	$effect(() => {
		const req = gotoLine;
		if (!req || !view) return;
		const { from, to } = resolveTarget(view.state.doc, req);
		view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true, effects: flashLineEffect.of(from) });
		view.focus();
	});

	onDestroy(() => {
		sourceCmView.set(null);
		view?.destroy();
	});
</script>

<svelte:window onkeydown={(e) => ctxMenu && e.key === 'Escape' && closeMenu()} />

<div bind:this={host} class="source-editor h-full" oncontextmenu={onContextMenu} role="presentation"></div>

{#if ctxMenu}
	<button
		class="fixed inset-0 z-40 cursor-default"
		aria-label="Close menu"
		onclick={closeMenu}
		oncontextmenu={(e) => (e.preventDefault(), closeMenu())}
	></button>
	<div
		class="bg-surface-50-950 border-surface-300-700 fixed z-50 min-w-48 overflow-hidden rounded border py-1 text-sm shadow-lg"
		style="left: {ctxMenu.x}px; top: {ctxMenu.y}px"
	>
		<button class={itemClass} disabled={!ctxMenu.hasSelection} onclick={() => (cmCut(), closeMenu())}>
			<Scissors class="size-4 opacity-70" /> Cut <span class="text-surface-500 ml-auto text-xs">⌘X</span>
		</button>
		<button class={itemClass} disabled={!ctxMenu.hasSelection} onclick={() => (cmCopy(), closeMenu())}>
			<Copy class="size-4 opacity-70" /> Copy <span class="text-surface-500 ml-auto text-xs">⌘C</span>
		</button>
		<button class={itemClass} onclick={() => (cmPaste(), closeMenu())}>
			<ClipboardPaste class="size-4 opacity-70" /> Paste <span class="text-surface-500 ml-auto text-xs">⌘V</span>
		</button>
		<button class={itemClass} onclick={() => (cmSelectAll(), closeMenu())}>
			<span class="size-4 shrink-0"></span> Select All <span class="text-surface-500 ml-auto text-xs">⌘A</span>
		</button>
		<div class="border-surface-200-800 my-1 border-t"></div>
		<button class={itemClass} onclick={() => (cmFind(), closeMenu())}>
			<Search class="size-4 opacity-70" /> Find… <span class="text-surface-500 ml-auto text-xs">⌘F</span>
		</button>
		{#if onSyncToPdf}
			<div class="border-surface-200-800 my-1 border-t"></div>
			<button class={itemClass} onclick={() => (onSyncToPdf?.(ctxMenu.line), closeMenu())}>
				<LocateFixed class="size-4 opacity-70" /> Show in PDF
			</button>
		{/if}
	</div>
{/if}

<style>
	.source-editor :global(.cm-editor) {
		height: 100%;
		font-size: 0.875rem;
		position: relative; /* anchor the floating top-right search panel */
	}
	/* float texpileSearch's panel top-right as the same card the visual editor's find bar uses
	   (SearchBar.svelte), so the two search UIs stay consistent */
	.source-editor :global(.cm-panels.cm-panels-top) {
		position: absolute;
		top: 0.5rem;
		right: 0.75rem;
		left: auto;
		width: max-content;
		max-width: calc(100% - 1.5rem);
		background: var(--color-surface-50);
		border: 1px solid var(--color-surface-200);
		border-radius: var(--radius-container, 0.75rem);
		box-shadow:
			0 20px 25px -5px rgb(0 0 0 / 0.1),
			0 8px 10px -6px rgb(0 0 0 / 0.1);
		z-index: 20;
		overflow: hidden;
	}
	:global([data-mode='dark'] .source-editor .cm-panels.cm-panels-top) {
		background: var(--color-surface-950);
		border-color: var(--color-surface-800);
	}
	/* same amber scale the ProseMirror search uses (SearchBar.svelte) */
	.source-editor :global(.cm-searchMatch) {
		background-color: rgb(255, 237, 153);
	}
	.source-editor :global(.cm-searchMatch-selected) {
		background-color: rgb(255, 213, 79);
	}
	:global([data-mode='dark'] .source-editor .cm-searchMatch) {
		background-color: rgb(102, 77, 3);
	}
	:global([data-mode='dark'] .source-editor .cm-searchMatch-selected) {
		background-color: rgb(161, 123, 5);
	}
	.source-editor :global(.cm-scroller) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		line-height: 1.6;
	}
	.source-editor :global(.cm-content) {
		padding: 1rem 0;
	}
	.source-editor :global(.cm-focused) {
		outline: none;
	}
</style>
