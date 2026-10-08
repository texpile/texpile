import { rawEditorActiveStore } from '$lib/stores/editorStore';
import {
	EditorView as CodeMirrorView,
	keymap as cmKeymap,
	drawSelection,
	rectangularSelection,
	crosshairCursor,
	type KeyBinding,
	type ViewUpdate
} from '@codemirror/view';
import { Compartment as CodeMirrorCompartment, EditorState as CodeMirrorState } from '@codemirror/state';
import { cmCommentHighlights, cmCommentClicks, syncCmCommentHighlights } from './cmComments';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { cmSyntaxHighlight } from '$lib/editor/source/cmHighlight';
import { exitCode } from 'prosemirror-commands';
import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
import { TextSelection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import { gapAwareSelectionNear } from '$lib/editor/visual/gapSelection';
import { withPinnedScroll } from '$lib/editor/visual/scrollPin';
import type { Node } from 'prosemirror-model';
import type { EditorView as ProseMirrorView, ViewMutationRecord } from 'prosemirror-view';
import { languages as cmlangdata } from '@codemirror/language-data';
import { mount, unmount } from 'svelte';
import CodeBlockSettings from './CodeBlockSettings.svelte';

import { markdown } from '@codemirror/lang-markdown';
import { renderStaticCodeBlock, setStaticCode } from './cmStatic';
import { upgradeWhenNear, cancelUpgrade } from '$lib/editor/visual/extensions/mathlivebridge/mathViewport';
import type { Extension } from '@codemirror/state';

/** resolve a language by its (display) name. LaTeX routes to the app's own mode rather than
 *  language-data's stex, so a latex code block matches the source editor's colours. */
async function loadLanguageByName(name: string | null | undefined): Promise<{ name: string; support: Extension } | null> {
	if (!name) return null;
	if (/^(latex|tex|stex)$/i.test(name)) {
		const { latex } = await import('$lib/languages/latex/source/latexLanguage');
		return { name: 'LaTeX', support: latex() };
	}
	const lang = cmlangdata.find((l) => l.name.toLowerCase() === name.toLowerCase());
	if (!lang) return null;
	return { name: lang.name, support: await lang.load() };
}

// reactive props stashed on the container so update() can reach the mounted component without a registry.
type SettingsHost = {
	__svelteComponentProps?: { node: Node; view: ProseMirrorView; getPos: () => number | undefined };
} & HTMLElement;

export class CodeBlockView {
	node: Node;
	view: ProseMirrorView;
	getPos: () => number;
	/** undefined until materialize() runs */
	cm?: CodeMirrorView;
	dom: HTMLElement;
	updating: boolean;
	languageConf = new CodeMirrorCompartment();
	language = new CodeMirrorCompartment();
	tabSize = new CodeMirrorCompartment();
	/** plain-text stand-in until this block nears the viewport */
	private placeholder?: HTMLElement;
	private settingsContainer: HTMLElement;
	private settingsComponent?: ReturnType<typeof mount>;

	constructor(node: Node, view: ProseMirrorView, getPos: () => number) {
		this.node = node;
		this.view = view;
		this.getPos = getPos;
		this.updating = false;

		const wrapper = document.createElement('div');
		// A quiet inset, not a floating card. The old styling (2px --color-gray-1100 plus shadow-lg)
		// drew more attention than the code inside it, and that border is a single fixed light blue
		// with no dark variant, so it glowed against a dark editor and vanished against a light one.
		// The markdown and typst editors had each already overridden this card as "too loud"; this is
		// their treatment, promoted to the shared default so all three dialects match.
		// `relative` anchors the settings gear; `pr-9` reserves a right-hand column for it, so the
		// gear NEVER sits over the code - an overlapping control takes the clicks and focus meant
		// for CodeMirror, which is how two earlier pickers left the document untypable.
		wrapper.className = 'noautofocus cm-wrapper relative border-surface-300-700 bg-surface-50-950 m-1 rounded-md border p-2 pr-9';
		this.dom = wrapper;

		// Same reasoning as the inline chips: a CodeMirror instance per block is expensive, and a
		// block the reader cannot see does not need one. Plain text now, real editor on approach.
		this.placeholder = renderStaticCodeBlock(this.node.textContent);
		wrapper.appendChild(this.placeholder);

		// The settings gear, in the reserved right column. ALWAYS visible, like the table wrapper's
		// settings button and unlike the equation gear: hover-revealed chrome flashes whenever the
		// DOM under the pointer is rebuilt, because :hover has to be re-established on the fresh
		// element - a control that looks the same before and after a rebuild has nothing to flash.
		// contentEditable=false plus the stopEvent/ignoreMutation guards below keep ProseMirror out
		// of it: it is chrome, not content. (The attribute, not the property: jsdom's property
		// setter does not reflect to the attribute, which is what selectors act on.)
		this.settingsContainer = document.createElement('div');
		this.settingsContainer.setAttribute('contenteditable', 'false');
		wrapper.appendChild(this.settingsContainer);
		this.mountSettings();

		this.handleFocus = this.handleFocus.bind(this);
		this.handleBlur = this.handleBlur.bind(this);

		upgradeWhenNear(this.dom, this.materialize);
	}

	/** Builds the settings popover. Eager: the gear is always visible, so there is no moment where
	 * deferring the mount would be invisible to the user. */
	private mountSettings = (): void => {
		if (this.settingsComponent) return;

		const componentProps = $state({
			node: this.node,
			view: this.view,
			getPos: this.getPos
		});

		this.settingsComponent = mount(CodeBlockSettings, {
			target: this.settingsContainer,
			props: componentProps
		});

		(this.settingsContainer as SettingsHost).__svelteComponentProps = componentProps;
	};

	/** Swaps the plain-text stand-in for a real CodeMirror. One-way and idempotent. */
	private materialize = (): void => {
		if (this.cm) return;

		this.cm = new CodeMirrorView({
			// this.node, not the constructor's: an edit can land while the placeholder is still up
			doc: this.node.textContent,
			extensions: [
				cmKeymap.of([...this.codeMirrorKeymap(), ...defaultKeymap]),
				cmKeymap.of([indentWithTab]),
				drawSelection(),
				// Multiple cursors, same as the source editor. forwardUpdate only mirrors the MAIN range
				// back to ProseMirror - a PM selection cannot hold more than one range - but the edits
				// themselves all arrive through iterChanges, so typing at several carets is applied in full.
				CodeMirrorState.allowMultipleSelections.of(true),
				rectangularSelection(),
				crosshairCursor(),
				this.languageConf.of(markdown()),
				cmSyntaxHighlight(),
				cmCommentHighlights,
				cmCommentClicks(this.view, () => this.getPos()),
				// the card's own p-2 is the visual gap; drop CodeMirror's default 6px line inset
				CodeMirrorView.theme({ '.cm-line': { padding: '0 2px' } }),
				CodeMirrorView.updateListener.of((update) => this.forwardUpdate(update)),
				CodeMirrorView.contentAttributes.of({ spellcheck: 'false' }),
				CodeMirrorView.contentAttributes.of({ 'data-gramm': 'false' }), // disable grammarly
				CodeMirrorView.contentAttributes.of({ 'data-gramm_editor': 'false' }),
				CodeMirrorView.contentAttributes.of({ 'data-enable-grammarly': 'false' })
			]
		});

		const cm = this.cm;
		if (this.placeholder) {
			this.dom.replaceChild(cm.dom, this.placeholder);
			this.placeholder = undefined;
		} else {
			this.dom.appendChild(cm.dom);
		}

		const currentlang = this.node.attrs.lang;
		void loadLanguageByName(currentlang).then((lang) => {
			if (!lang) return;
			cm.dispatch({
				effects: this.languageConf.reconfigure(lang.support)
			});
		});

		cm.dom.addEventListener('focus', this.handleFocus, true);
		cm.dom.addEventListener('blur', this.handleBlur, true);

		this.syncCommentHighlights();
	};

	/** last ranges handed to CodeMirror, so a no-op update doesn't dispatch */
	private lastCommentKey = '[]';

	private syncCommentHighlights = (): void => {
		if (!this.cm) return;
		this.lastCommentKey = syncCmCommentHighlights(this.cm, this.view, this.getPos, this.node, this.lastCommentKey);
	};

	/** this block is the one the format bar is out of the way for */
	private holdsBar = false;

	// no formatting applies inside a code block: the format bar steps aside while it has the caret
	handleFocus() {
		this.holdsBar = true;
		rawEditorActiveStore.current = true;
	}
	handleBlur() {
		this.holdsBar = false;
		rawEditorActiveStore.current = false;
		this.deselectNode();
	}

	forwardUpdate(update: ViewUpdate): void {
		// only reached from CodeMirror's own update listener, so this is a type guard
		if (!this.cm) return;
		if (this.updating || !this.cm.hasFocus) return;
		let offset = this.getPos() + 1;
		const { main } = update.state.selection;
		const selFrom = offset + main.from,
			selTo = offset + main.to;
		const pmSel = this.view.state.selection;
		if (update.docChanged || pmSel.from != selFrom || pmSel.to != selTo) {
			const tr = this.view.state.tr;
			update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
				if (text.length) tr.replaceWith(offset + fromA, offset + toA, this.node.type.schema.text(text.toString()));
				else tr.delete(offset + fromA, offset + toA);
				offset += toB - fromB - (toA - fromA);
			});
			tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo));
			this.view.dispatch(tr);
		}
	}

	setSelection(anchor: number, head: number): void {
		// the caret is arriving, so the editor has to exist now regardless of the viewport
		this.materialize();
		if (!this.cm) return;
		this.cm.focus();
		this.updating = true;
		this.cm.dispatch({ selection: { anchor, head } });
		this.updating = false;
	}

	codeMirrorKeymap(): KeyBinding[] {
		const view = this.view;
		return [
			{
				key: 'ArrowUp',
				run: () => this.maybeEscape('line', -1)
			},
			{
				key: 'ArrowLeft',
				run: () => this.maybeEscape('char', -1)
			},
			{
				key: 'ArrowDown',
				run: () => this.maybeEscape('line', 1)
			},
			{
				key: 'ArrowRight',
				run: () => this.maybeEscape('char', 1)
			},
			{
				key: 'Ctrl-Enter',
				mac: 'Cmd-Enter', // match the raw/inline-latex views
				run: () => {
					if (!exitCode(view.state, view.dispatch)) return false;
					view.focus();
					return true;
				}
			},
			{
				key: 'Ctrl-z',
				mac: 'Cmd-z',
				run: () => undoVisual()
			},
			{
				key: 'Shift-Ctrl-z',
				mac: 'Shift-Cmd-z',
				run: () => redoVisual()
			},
			{
				key: 'Ctrl-y',
				mac: 'Cmd-y',
				run: () => redoVisual()
			},
			{ key: 'Backspace', run: () => this.maybeDelete() }
		];
	}

	maybeDelete(): boolean {
		// keymap handlers: CodeMirror had to exist for the key to reach here
		if (!this.cm) return false;
		if (this.cm.state.doc.toString().trim() !== '') {
			return false;
		}

		const pos = this.getPos();
		const tr = this.view.state.tr.delete(pos, pos + this.node.nodeSize);
		this.view.dispatch(tr);
		this.view.focus();
		return true;
	}

	maybeEscape(unit: string, dir: number): boolean {
		if (!this.cm) return false;
		const { state } = this.cm;
		let { main } = state.selection;
		if (!main.empty) return false;
		if (unit === 'line') main = state.doc.lineAt(main.head) as never;
		if (dir < 0 ? main.from > 0 : main.to < state.doc.length) return false;
		const targetPos = this.getPos() + (dir < 0 ? 0 : this.node.nodeSize);
		// gap-aware: Selection.near alone lands back inside this block when nothing follows. a gap
		// landing is adjacent and already on screen, so hold the viewport still through the
		// dispatch/refocus instead of scrolling
		const selection = gapAwareSelectionNear(this.view.state.doc.resolve(targetPos), dir);
		if (selection instanceof GapCursor) {
			withPinnedScroll(this.view.dom, () => {
				this.view.dispatch(this.view.state.tr.setSelection(selection));
				this.view.focus();
			});
			return true;
		}
		const tr = this.view.state.tr.setSelection(selection).scrollIntoView();
		this.view.dispatch(tr);
		this.view.focus();
		return true;
	}

	update(node: Node): boolean {
		if (node.type != this.node.type) return false;
		// The language can change from outside this view too (undo, a collaborator, the source
		// editor, the settings popover) - re-highlight for it. The old dropdown only relabeled
		// itself here, so an external language change kept the stale colours until reload.
		const prevLang = String(this.node.attrs.lang || '');
		this.node = node;
		const requested = String(node.attrs.lang || '');
		if (this.cm && requested !== prevLang) {
			void loadLanguageByName(requested).then((lang) => {
				// stale resolve: the language changed again while this import was in flight
				if (!this.cm || String(this.node.attrs.lang || '') !== requested) return;
				// A language with no CodeMirror grammar (much of the listings set: ABAP, Ada, ...)
				// clears the colours rather than keeping the old grammar - Python tokens sitting on
				// Ada code reads as "the switch did nothing".
				this.cm.dispatch({ effects: this.languageConf.reconfigure(lang ? lang.support : []) });
			});
		}
		const existingProps = (this.settingsContainer as SettingsHost).__svelteComponentProps;
		if (existingProps) existingProps.node = node;
		// decoration-only changes (a comment placed, focused, or dismissed) arrive here too
		this.syncCommentHighlights();
		if (this.updating) return true;
		const newText = node.textContent;

		if (!this.cm) {
			// still plain text: keep the stand-in in sync, and its line count right, so an offscreen
			// edit does not shift the scroll position when the block finally upgrades
			if (this.placeholder) setStaticCode(this.placeholder, newText);
			return true;
		}

		const curText = this.cm.state.doc.toString();
		if (newText != curText) {
			let start = 0,
				curEnd = curText.length,
				newEnd = newText.length;
			while (start < curEnd && curText.charCodeAt(start) == newText.charCodeAt(start)) {
				++start;
			}
			while (curEnd > start && newEnd > start && curText.charCodeAt(curEnd - 1) == newText.charCodeAt(newEnd - 1)) {
				curEnd--;
				newEnd--;
			}
			this.updating = true;
			this.cm.dispatch({
				changes: {
					from: start,
					to: curEnd,
					insert: newText.slice(start, newEnd)
				}
			});
			this.updating = false;
		}
		return true;
	}

	selectNode(): void {
		this.materialize();
		this.cm?.focus();
	}

	deselectNode(): void {
		setTimeout(() => {
			this.cm?.dispatch({ selection: { anchor: 0, head: 0 } });
		}, 0);
	}

	stopEvent(event: Event): boolean {
		// the settings gear is chrome: its clicks are never document edits, and before CodeMirror
		// exists the rule below would hand them to ProseMirror, which puts the caret in the block
		const t = event.target;
		if (t instanceof globalThis.Node && this.settingsContainer.contains(t)) return true;
		// Once CodeMirror exists it owns everything inside the block. While it is still plain text
		// there is nothing to own the events, so let ProseMirror handle the click and route it back
		// here through selectNode().
		return this.cm !== undefined;
	}

	/**
	 * Ignore every DOM mutation in here except selection, which is exactly what a contentDOM-less
	 * node view got by default before any explicit guard existed. Everything inside the wrapper
	 * belongs to CodeMirror or the settings gear, and edits flow back through forwardUpdate - no
	 * mutation is ever document content. That INCLUDES the placeholder-to-CodeMirror swap: a
	 * narrower guard here (ignore only the settings container) let PM read that swap as dirt and
	 * recreate the node view, which re-armed the swap - an infinite rebuild loop, ~50 per second,
	 * that surfaced as flashing chrome, unclickable settings, and unfocusable blocks.
	 */
	ignoreMutation(mutation: ViewMutationRecord): boolean {
		return mutation.type !== 'selection';
	}

	// ProseMirror calls destroy(); this used to be spelled `destory`, so it never ran and every
	// removed code block leaked its CodeMirror instance and both capture listeners.
	destroy() {
		cancelUpgrade(this.dom);
		if (this.settingsComponent) unmount(this.settingsComponent);
		if (!this.cm) return;
		// torn down with the caret in it: no blur comes to bring the format bar back
		if (this.holdsBar) rawEditorActiveStore.current = false;
		this.cm.dom.removeEventListener('focus', this.handleFocus, true);
		this.cm.dom.removeEventListener('blur', this.handleBlur, true);
		this.cm.destroy();
	}
}
