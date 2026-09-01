import { EditorView as CodeMirrorView, keymap as cmKeymap, drawSelection, type ViewUpdate, type KeyBinding } from '@codemirror/view';
import { Compartment as CodeMirrorCompartment } from '@codemirror/state';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { cmSyntaxHighlight } from '$lib/editor/source/cmHighlight';
import { exitCode } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { TextSelection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import { gapAwareSelectionNear } from '$lib/editor/visual/gapSelection';
import { withPinnedScroll } from '$lib/editor/visual/scrollPin';
import type { Node } from 'prosemirror-model';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';
import { languages as cmlangdata } from '@codemirror/language-data';
import { rawEditorActiveStore } from '$lib/stores/editorStore';
import { latexAutocomplete } from '$lib/languages/latex/intellisense/intellisense';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { cmCommentHighlights, cmCommentClicks, syncCmCommentHighlights } from '$lib/editor/visual/extensions/codemirrorbridge/cmComments';

// codemirror-backed NodeView for raw source blocks; content reaches the serializer unprocessed.
// attrs.lang picks the CodeMirror mode: 'latex' (default, with autocomplete), or 'html' /
// 'markdown' for the raw islands a markdown doc produces.
const LANG_NAMES: Record<string, string> = { latex: 'LaTeX', html: 'HTML', markdown: 'Markdown' };

export class RawLatexView {
	node: Node;
	view: ProseMirrorView;
	getPos: () => number;
	cm: CodeMirrorView;
	dom: HTMLElement;
	updating = false;
	languageConf = new CodeMirrorCompartment();

	constructor(node: Node, view: ProseMirrorView, getPos: () => number) {
		this.node = node;
		this.view = view;
		this.getPos = getPos;

		this.cm = new CodeMirrorView({
			doc: this.node.textContent,
			extensions: [
				cmKeymap.of([...this.codeMirrorKeymap(), ...defaultKeymap]),
				cmKeymap.of([indentWithTab]),
				drawSelection(),
				// wrap long lines instead of scrolling horizontally
				CodeMirrorView.lineWrapping,
				this.languageConf.of([]), // lang loads async below
				cmSyntaxHighlight(),
				cmCommentHighlights,
				cmCommentClicks(view, () => this.getPos()),
				// popup escapes the block's box; only latex content has completions to offer
				...(String(node.attrs.lang ?? 'latex') === 'latex' ? [latexAutocomplete({ tooltipsInBody: true })] : []),
				// transparent surface so the raw block blends into the document; tight insets - the
				// wrapper's own padding is the visual gap, not CodeMirror's default 6px line inset
				CodeMirrorView.theme({
					'&': { backgroundColor: 'transparent' },
					// face and padding are set in app.css instead: the offscreen placeholder borrows
					// CodeMirror's own class names, and a view-scoped theme never reaches it, so the
					// two would measure differently and every upgrade would nudge the scroll
					'.cm-content': { backgroundColor: 'transparent' },
					'.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
					'.cm-activeLine': { backgroundColor: 'transparent' },
					'.cm-activeLineGutter': { backgroundColor: 'transparent' },
					'&.cm-focused': { outline: 'none' }
				}),
				CodeMirrorView.updateListener.of((update) => this.forwardUpdate(update)),
				CodeMirrorView.contentAttributes.of({ spellcheck: 'false' }),
				CodeMirrorView.contentAttributes.of({ 'data-gramm': 'false' }),
				CodeMirrorView.contentAttributes.of({ 'data-gramm_editor': 'false' }),
				CodeMirrorView.contentAttributes.of({ 'data-enable-grammarly': 'false' })
			]
		});

		// layout only; the island's look lives beside the inline chip's in app.css
		const wrapper = document.createElement('div');
		wrapper.className = 'noautofocus raw-latex-wrapper my-1';

		wrapper.appendChild(this.cm.dom);
		this.dom = wrapper;

		if (String(node.attrs.lang ?? 'latex') === 'typst') {
			// typst isn't in @codemirror/language-data; the app ships its own wasm-backed language
			// (island flavour: no fold gutter on a chip)
			void import('$lib/languages/typst/source/typstLanguage').then(({ typstIslandLanguage }) => {
				this.cm.dispatch({ effects: this.languageConf.reconfigure(typstIslandLanguage()) });
			});
		} else if (String(node.attrs.lang ?? 'latex') === 'latex') {
			// the app's own LaTeX mode, same tags and colours as the source editor
			this.cm.dispatch({ effects: this.languageConf.reconfigure(latex()) });
		} else {
			const langName = LANG_NAMES[String(node.attrs.lang ?? 'latex')] ?? 'LaTeX';
			const langData = cmlangdata.find((lang) => lang.name === langName);
			if (langData) {
				langData.load().then((lang) => {
					this.cm.dispatch({
						effects: this.languageConf.reconfigure(lang)
					});
				});
			}
		}

		this.handleFocus = this.handleFocus.bind(this);
		this.handleBlur = this.handleBlur.bind(this);
		this.cm.dom.addEventListener('focus', this.handleFocus, true);
		this.cm.dom.addEventListener('blur', this.handleBlur, true);

		this.lastCommentKey = syncCmCommentHighlights(this.cm, this.view, this.getPos, this.node, this.lastCommentKey);
	}

	/** last comment ranges handed to CodeMirror, so a no-op update doesn't dispatch */
	private lastCommentKey = '[]';

	handleFocus() {
		rawEditorActiveStore.current = true; // toolbar swaps to the raw-LaTeX bar
	}

	handleBlur() {
		rawEditorActiveStore.current = false;
		this.deselectNode();
	}

	forwardUpdate(update: ViewUpdate): void {
		if (this.updating || !this.cm.hasFocus) return;
		let offset = this.getPos() + 1;
		const { main } = update.state.selection;
		const selFrom = offset + main.from,
			selTo = offset + main.to;
		const pmSel = this.view.state.selection;
		if (update.docChanged || pmSel.from != selFrom || pmSel.to != selTo) {
			const tr = this.view.state.tr;
			update.changes.iterChanges((fromA: number, toA: number, fromB: number, toB: number, text) => {
				if (text.length) tr.replaceWith(offset + fromA, offset + toA, this.node.type.schema.text(text.toString()));
				else tr.delete(offset + fromA, offset + toA);
				offset += toB - fromB - (toA - fromA);
			});
			tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo));
			this.view.dispatch(tr);
		}
	}

	setSelection(anchor: number, head: number): void {
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
				run: () => {
					if (!exitCode(view.state, view.dispatch)) return false;
					view.focus();
					return true;
				}
			},
			{
				key: 'Ctrl-z',
				mac: 'Cmd-z',
				run: () => undo(view.state, view.dispatch)
			},
			{
				key: 'Shift-Ctrl-z',
				mac: 'Shift-Cmd-z',
				run: () => redo(view.state, view.dispatch)
			},
			{
				key: 'Ctrl-y',
				mac: 'Cmd-y',
				run: () => redo(view.state, view.dispatch)
			},
			{ key: 'Backspace', run: () => this.maybeDelete() }
		];
	}

	maybeDelete(): boolean {
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
		this.node = node;
		// decoration-only changes (a comment placed, focused, or dismissed) arrive here too
		this.lastCommentKey = syncCmCommentHighlights(this.cm, this.view, this.getPos, this.node, this.lastCommentKey);
		if (this.updating) return true;
		const newText = node.textContent,
			curText = this.cm.state.doc.toString();
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
		this.cm.focus();
	}

	deselectNode(): void {
		setTimeout(() => {
			this.cm.dispatch({ selection: { anchor: 0, head: 0 } });
		}, 0);
	}

	stopEvent(): boolean {
		return true;
	}

	destroy() {
		this.cm.dom.removeEventListener('focus', this.handleFocus, true);
		this.cm.dom.removeEventListener('blur', this.handleBlur, true);
		this.cm.destroy();
	}
}
