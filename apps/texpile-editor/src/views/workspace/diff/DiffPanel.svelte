<script lang="ts">
	// A saved version against the working copy, via @codemirror/merge.
	//
	// The version is read-only; the working copy is the FILE, so it is editable and a keystroke goes
	// back through the buffer's own handler. merge re-diffs as it changes, which is what makes an
	// editable diff honest.
	import { onDestroy } from 'svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { centerRevertArrows } from './diffRevertArrows';
	import { joinCollapsedBars } from './diffCollapsedBars';
	import { EditorView, lineNumbers, keymap, drawSelection } from '@codemirror/view';
	import { EditorState, type Extension } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { tabIndentBinding } from '$lib/editor/source/extensions/keybindings/cmTabKey';
	import { LanguageDescription } from '@codemirror/language';
	import { languages as cmlangdata } from '@codemirror/language-data';
	import { unifiedMergeView, MergeView, goToNextChunk, goToPreviousChunk } from '@codemirror/merge';
	import { m as msg } from '$lib/paraglide/messages';
	import { cmSyntaxHighlight } from '$lib/editor/source/cmHighlight';
	import { bibtex } from '$lib/languages/bib/bibtexLanguage';
	import { latex } from '$lib/languages/latex/source/latexLanguage';

	type Props = {
		filename?: string;
		original?: string;
		modified?: string;
		layout?: 'unified' | 'split';
		/** the version is still being read, so neither side is the pair to build from yet */
		loading?: boolean;
		/** set while co-editing: this pane holds plain text, so an edit would be a whole-text replace
		 *  against a CRDT others are typing into. The Y-bound source editor is where that happens. */
		readOnly?: boolean;
		/** the whole text, the shape the buffer's own handler takes */
		onModifiedInput?: (value: string) => void;
	};
	let {
		filename = '',
		original = '',
		modified = '',
		layout = 'unified',
		loading = false,
		readOnly = false,
		onModifiedInput
	}: Props = $props();

	let host = $state<HTMLDivElement>();
	let current: EditorView | MergeView | null = null;
	/** undoes what split's helpers added to the merge view */
	let splitCleanups: (() => void)[] = [];
	/** in split the b editor; unified, the whole view */
	let modifiedView: EditorView | null = null;
	let langExt = $state<Extension>([]);
	// what the view was built from. Plain locals: the rebuild effect writes them and must not re-run.
	let builtOriginal: string | null = null;
	let builtLayout: 'unified' | 'split' | null = null;
	let builtLang: Extension | null = null;

	// normalize CRLF -> LF on both sides: git show returns LF bytes while the working buffer may be
	// CRLF (core.autocrlf on Windows); without this every line reads as changed
	function lf(s: string) {
		return s.replace(/\r\n/g, '\n');
	}
	const COLLAPSE = { margin: 3, minSize: 4 };

	// resolve the syntax mode for filename into a plain extension so the build below can
	// drop it into both panes without compartment juggling
	$effect(() => {
		const f = filename;
		if (f && /\.bib$/i.test(f)) {
			langExt = bibtex();
			return;
		}
		if (!f || /\.(tex|cls|sty)$/i.test(f)) {
			// the app's own LaTeX mode, same tags and colours as the source editor
			langExt = latex();
			return;
		}
		let cancelled = false;
		if (/\.typ$/i.test(f)) {
			// island flavour: highlighting only, no folding in a view that already collapses lines
			void import('$lib/languages/typst/source/typstLanguage').then(({ typstIslandLanguage }) => {
				if (!cancelled) langExt = typstIslandLanguage();
			});
			return () => {
				cancelled = true;
			};
		}
		const desc = LanguageDescription.matchFilename(cmlangdata, f);
		if (!desc) {
			langExt = [];
			return;
		}
		desc.load().then((lang) => {
			if (!cancelled) langExt = lang;
		});
		return () => {
			cancelled = true;
		};
	});

	function sharedExts(): Extension[] {
		// drawSelection for the CARET, not the selection: without it CodeMirror's base theme keeps the
		// native one at `caret-color: black`, which nothing overrides because no editor here sets
		// EditorView.darkTheme - so the caret was invisible on a dark diff. It draws .cm-cursor
		// instead, which app.css already colours, and brings this pane's selection with it.
		return [lineNumbers(), drawSelection(), cmSyntaxHighlight(), langExt, EditorView.lineWrapping];
	}

	function editable(): boolean {
		return !readOnly && !!onModifiedInput;
	}

	/** bytes in git, with nowhere to write back to */
	function versionExts(): Extension[] {
		return [EditorState.readOnly.of(true), EditorView.editable.of(false), ...sharedExts()];
	}

	/** the change after or before the caret, as Alt+F5 and Shift+Alt+F5 step the source editor's margin */
	const STEP_KEYS = keymap.of([
		{ key: 'Alt-F5', run: goToNextChunk },
		{ key: 'Shift-Alt-F5', run: goToPreviousChunk }
	]);

	export function step(dir: 1 | -1): void {
		if (!modifiedView) return;
		(dir === 1 ? goToNextChunk : goToPreviousChunk)(modifiedView);
		modifiedView.focus();
	}

	// lucide's arrow-right
	const ARROW_ICON =
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';

	/** Put back: one change replaced by the version's lines, where the working copy can be written.
	 *  Not merge's Accept, which would edit the version, and there is no writing into git from here. */
	function putBack(action?: (e: MouseEvent) => void): HTMLElement {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'cm-diff-put-back';
		// split's control sits in the narrow gap between the two sides: an arrow from the version to
		// the working copy there, and the words on the tooltip
		if (action) b.textContent = msg.wsview_diff_put_back();
		else b.innerHTML = ARROW_ICON;
		b.setAttribute('aria-label', msg.wsview_diff_put_back());
		tip(b, msg.wsview_diff_put_back_tip());
		// unified hands over what to run; split listens on its own gutter control
		if (action) b.addEventListener('mousedown', action);
		return b;
	}

	/** typing here edits the file, so it needs the editing basics - undo among them */
	function workingExts(): Extension[] {
		const emit = onModifiedInput;
		if (readOnly || !emit) return [...versionExts(), STEP_KEYS];
		return [
			...sharedExts(),
			history(),
			STEP_KEYS,
			keymap.of([...defaultKeymap, ...historyKeymap, tabIndentBinding]),
			EditorView.updateListener.of((u) => {
				if (u.docChanged) emit(u.state.doc.toString());
			})
		];
	}

	// rebuilding is the simplest way to force a re-diff, and now the destructive one: mid-sentence
	// it takes the caret with it, so an edit echoing back must not count as a reason
	$effect(() => {
		const o = lf(original);
		const m = lf(modified);
		const lay = layout;
		const lang = langExt; // rebuild when the resolved language arrives
		if (!host) return;
		// the version is still being read, so there is no pair to compare yet. Only on the FIRST
		// build: while a refresh is in flight the previous comparison stays up rather than blinking
		// out. Without this the panel built an empty merge view the moment the diff opened, and
		// replaced it a moment later with the real one.
		if (loading && !modifiedView) return;
		// an edit flows out to the buffer and a later snapshot brings the same text back
		if (modifiedView && o === builtOriginal && lay === builtLayout && lang === builtLang && m === modifiedView.state.doc.toString()) {
			return;
		}
		for (const undo of splitCleanups) undo();
		splitCleanups = [];
		current?.destroy();
		// eslint-disable-next-line svelte/no-dom-manipulating -- the div is an empty mount point Svelte never renders into; MergeView owns its children
		host.replaceChildren();
		if (lay === 'split') {
			const mv = new MergeView({
				parent: host,
				a: { doc: o, extensions: versionExts() }, // the saved version
				b: { doc: m, extensions: workingExts() }, // the working copy
				orientation: 'a-b',
				// the version's lines into the working copy, where there is one to write to
				...(editable() ? { revertControls: 'a-to-b' as const, renderRevertControl: () => putBack() } : {}),
				// no coloured bar down the left edge: the line tint already says which lines changed
				gutter: false,
				highlightChanges: true,
				collapseUnchanged: COLLAPSE
			});
			current = mv;
			modifiedView = mv.b;
			splitCleanups = [joinCollapsedBars(mv), ...(editable() ? [centerRevertArrows(mv)] : [])];
		} else {
			const view = new EditorView({
				parent: host,
				state: EditorState.create({
					doc: m,
					extensions: [
						...workingExts(),
						unifiedMergeView({
							original: o,
							mergeControls: editable() ? (type, action) => (type === 'reject' ? putBack(action) : document.createElement('span')) : false,
							gutter: false,
							collapseUnchanged: COLLAPSE
						})
					]
				})
			});
			current = view;
			modifiedView = view;
		}
		builtOriginal = o;
		builtLayout = lay;
		builtLang = lang;
	});

	onDestroy(() => {
		for (const undo of splitCleanups) undo();
		current?.destroy();
		modifiedView = null;
	});
</script>

<div bind:this={host} class="diff-panel h-full"></div>

<style>
	.diff-panel :global(.cm-editor) {
		height: 100%;
		font-size: 0.875rem;
	}
	.diff-panel :global(.cm-mergeView),
	.diff-panel :global(.cm-mergeViewEditors) {
		height: 100%;
	}
	.diff-panel :global(.cm-scroller) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		line-height: 1.6;
	}
	.diff-panel :global(.cm-content) {
		padding: calc(var(--spacing) * 2) 0;
	}
	.diff-panel :global(.cm-focused) {
		outline: none;
	}
	/* the app's quiet button rather than merge's, which is white text on a coloured fill; the
	   doubled class outranks merge's theme rule for chunk buttons */
	.diff-panel :global(.cm-diff-put-back.cm-diff-put-back) {
		font-family: var(--font-sans, system-ui, sans-serif);
		font-size: 11px;
		line-height: 1.5;
		margin: 2px 4px;
		padding: 0 8px;
		border-radius: 4px;
		border: 1px solid color-mix(in oklab, var(--color-surface-950-50) 25%, transparent);
		background: var(--color-surface-50-950);
		color: var(--color-surface-950-50);
		cursor: pointer;
	}
	.diff-panel :global(.cm-diff-put-back.cm-diff-put-back:hover) {
		background: color-mix(in oklab, var(--color-surface-950-50) 10%, var(--color-surface-50-950));
	}
	/* split: VS Code's bare margin icon, a square at the middle of its change (diffRevertArrows.ts) */
	.diff-panel :global(.cm-merge-revert) {
		width: 28px;
	}
	.diff-panel :global(.cm-merge-revert .cm-diff-put-back.cm-diff-put-back) {
		left: 3px;
		box-sizing: border-box;
		width: 22px;
		height: 22px;
		min-width: 0;
		min-height: 0;
		line-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0;
		padding: 0;
		border: none;
		background: none;
		color: var(--muted-text);
	}
	.diff-panel :global(.cm-merge-revert .cm-diff-put-back.cm-diff-put-back:hover) {
		color: var(--color-surface-950-50);
		background: color-mix(in oklab, var(--color-surface-950-50) 12%, transparent);
	}

	/* collapsed unchanged region: theme-matched band instead of @codemirror/merge's washed-out defaults */
	.diff-panel :global(:is(.cm-collapsedLines, .diff-collapsed-bar)) {
		background: color-mix(in srgb, var(--color-surface-500) 12%, transparent);
		color: var(--muted-text);
	}
	/* split draws one bar across both sides (diffCollapsedBars.ts); merge's keep the room under it */
	.diff-panel :global(.cm-mergeViewEditors) {
		position: relative;
	}
	.diff-panel :global(.cm-mergeView .cm-collapsedLines) {
		visibility: hidden;
	}
	.diff-panel :global(.diff-collapsed-bar) {
		position: absolute;
		/* over the right side's line numbers, which merge's gutters lift to 200 */
		z-index: 201;
		box-sizing: border-box;
		padding: 5px 5px 5px 10px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.875rem;
		line-height: 1.6;
		white-space: nowrap;
		overflow: hidden;
		cursor: pointer;
	}
	.diff-panel :global(.diff-collapsed-bar)::before {
		content: '⦚';
		margin-inline-end: 7px;
	}
	.diff-panel :global(.diff-collapsed-bar)::after {
		content: '⦚';
		margin-inline-start: 7px;
	}

	/* deleted = error red, added = success green. cm-merge-a is the original pane, cm-merge-b the
	   modified one; the unified editor is cm-merge-b, so these cover both layouts. */
	.diff-panel :global(.cm-deletedChunk),
	.diff-panel :global(.cm-deletedLine),
	.diff-panel :global(.cm-merge-a .cm-changedLine) {
		background-color: color-mix(in srgb, var(--color-error-500) 12%, transparent) !important;
	}
	.diff-panel :global(.cm-deletedText),
	.diff-panel :global(.cm-deletedChunk .cm-deletedText),
	.diff-panel :global(.cm-merge-a .cm-changedText) {
		background: color-mix(in srgb, var(--color-error-500) 30%, transparent) !important;
	}
	.diff-panel :global(.cm-insertedLine),
	.diff-panel :global(.cm-merge-b .cm-changedLine) {
		background-color: color-mix(in srgb, var(--color-success-500) 12%, transparent) !important;
	}
	.diff-panel :global(.cm-merge-b .cm-changedText) {
		background: color-mix(in srgb, var(--color-success-500) 30%, transparent) !important;
	}
</style>
