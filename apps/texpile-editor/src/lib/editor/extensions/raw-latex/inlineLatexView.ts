import { EditorView as CodeMirrorView, keymap as cmKeymap, drawSelection, type ViewUpdate } from '@codemirror/view';
import { Compartment as CodeMirrorCompartment, EditorState } from '@codemirror/state';
import { cmSyntaxHighlight } from '$lib/editor/cmHighlight';
import { exitCode } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { TextSelection, Selection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';
import { languages as cmlangdata } from '@codemirror/language-data';
import { latexAutocomplete } from '$lib/editor/extensions/intellisense/intellisense';
import { renderStaticInlineCode, setStaticCode } from '$lib/editor/extensions/codemirrorbridge/cmStatic';
import { upgradeWhenNear, cancelUpgrade } from '$lib/editor/extensions/mathlivebridge/mathViewport';

// single-line inline codemirror for inline_latex; newlines rejected, enter / arrow-out exit the node
class InlineLatexView {
	node: Node;
	view: ProseMirrorView;
	getPos: () => number;
	/** undefined until materialize() runs */
	cm?: CodeMirrorView;
	dom: HTMLElement;
	updating = false;
	languageConf = new CodeMirrorCompartment();
	/** plain-text stand-in until this chip nears the viewport */
	private placeholder?: HTMLElement;

	constructor(node: Node, view: ProseMirrorView, getPos: () => number) {
		this.node = node;
		this.view = view;
		this.getPos = getPos;

		const wrapper = document.createElement('span');
		// thin outline only, matches the raw latex block
		wrapper.className =
			'noautofocus inline-latex-wrapper border-surface-400-600 mx-px inline-block rounded-base border px-0.5 align-baseline';
		this.dom = wrapper;

		// A CodeMirror instance per chip is the single biggest mount cost in a macro-heavy document:
		// 605 of them in the 80KB fixture. Start as plain text and build the editor when the chip
		// nears the viewport, or the moment the caret arrives.
		this.placeholder = renderStaticInlineCode(node.textContent);
		wrapper.appendChild(this.placeholder);

		// collapse the inner CM selection on blur: drawSelection renders even while unfocused, so
		// without this the chip keeps its own highlighted selection alongside the main editor's
		this.handleBlur = this.handleBlur.bind(this);

		upgradeWhenNear(this.dom, this.materialize);
	}

	/** Swaps the plain-text stand-in for a real CodeMirror. Keyed on visibility, so a chip that is on
	 * screen is always the syntax-highlighted article - upgrading on focus instead is what made an
	 * earlier attempt at this show a mix of coloured and plain chips. One-way and idempotent. */
	private materialize = (): void => {
		if (this.cm) return;

		this.cm = new CodeMirrorView({
			// this.node, not the constructor's: an edit can land while the placeholder is still up
			doc: this.node.textContent,
			extensions: [
				cmKeymap.of(this.codeMirrorKeymap()),
				drawSelection(),
				this.languageConf.of([]),
				cmSyntaxHighlight(),
				latexAutocomplete({ tooltipsInBody: true }), // popup escapes the inline node's box
				// reject anything that would make it multi-line
				EditorState.transactionFilter.of((tr) => (tr.newDoc.lines > 1 ? [] : tr)),
				// soft-wrap long inline blocks instead of pushing past the page width; still one logical line
				CodeMirrorView.lineWrapping,
				// inline-block shrink-to-fit keeps short macros tight, max-width + lineWrapping wraps long ones
				CodeMirrorView.theme({
					'&': { backgroundColor: 'transparent', display: 'inline-block', verticalAlign: 'baseline', maxWidth: '100%' },
					'.cm-scroller': {
						fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
						lineHeight: 'inherit',
						overflow: 'visible'
					},
					'.cm-content': { padding: '0', caretColor: 'auto' },
					'.cm-line': { padding: '0' },
					'&.cm-focused': { outline: 'none' }
				}),
				CodeMirrorView.updateListener.of((u) => this.forwardUpdate(u as never)),
				CodeMirrorView.contentAttributes.of({ spellcheck: 'false', 'data-gramm': 'false', 'data-enable-grammarly': 'false' })
			]
		});

		if (this.placeholder) {
			this.dom.replaceChild(this.cm.dom, this.placeholder);
			this.placeholder = undefined;
		} else {
			this.dom.appendChild(this.cm.dom);
		}

		const cm = this.cm;
		const latexLang = cmlangdata.find((lang) => lang.name === 'LaTeX');
		latexLang?.load().then((lang) => cm.dispatch({ effects: this.languageConf.reconfigure(lang) }));

		cm.dom.addEventListener('blur', this.handleBlur, true);
	};

	handleBlur() {
		this.deselectNode();
	}

	deselectNode(): void {
		setTimeout(() => {
			this.cm?.dispatch({ selection: { anchor: 0, head: 0 } });
		}, 0);
	}

	forwardUpdate(update: ViewUpdate): void {
		// only reached from CodeMirror's own update listener, so this is a type guard
		if (!this.cm) return;
		if (this.updating || !this.cm.hasFocus) return;
		let offset = this.getPos() + 1;
		const { main } = update.state.selection;
		const selFrom = offset + main.from;
		const selTo = offset + main.to;
		const pmSel = this.view.state.selection;
		if (update.docChanged || pmSel.from != selFrom || pmSel.to != selTo) {
			const tr = this.view.state.tr;
			update.changes.iterChanges((fromA: number, toA: number, _fromB: number, _toB: number, text) => {
				if (text.length) tr.replaceWith(offset + fromA, offset + toA, this.node.type.schema.text(text.toString()));
				else tr.delete(offset + fromA, offset + toA);
				offset += text.length - (toA - fromA);
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

	codeMirrorKeymap(): Array<unknown> {
		const view = this.view;
		const exit = () => {
			if (!exitCode(view.state, view.dispatch)) {
				// no exitCode target (inline mid-paragraph): move just past the node
				const after = this.getPos() + this.node.nodeSize;
				const sel = Selection.near(this.view.state.doc.resolve(after), 1);
				this.view.dispatch(this.view.state.tr.setSelection(sel).scrollIntoView());
			}
			view.focus();
			return true;
		};
		return [
			{ key: 'ArrowLeft', run: () => this.maybeEscape('char', -1) },
			{ key: 'ArrowRight', run: () => this.maybeEscape('char', 1) },
			{ key: 'ArrowUp', run: () => this.maybeEscape('char', -1) },
			{ key: 'ArrowDown', run: () => this.maybeEscape('char', 1) },
			{ key: 'Enter', run: exit },
			{ key: 'Ctrl-Enter', mac: 'Cmd-Enter', run: exit },
			{ key: 'Ctrl-z', mac: 'Cmd-z', run: () => undo(view.state, view.dispatch) },
			{ key: 'Shift-Ctrl-z', mac: 'Shift-Cmd-z', run: () => redo(view.state, view.dispatch) },
			{ key: 'Ctrl-y', mac: 'Cmd-y', run: () => redo(view.state, view.dispatch) },
			{ key: 'Backspace', run: () => this.maybeDelete() }
		];
	}

	maybeDelete(): boolean {
		// keymap handlers: CodeMirror had to exist for the key to reach here
		if (!this.cm) return false;
		if (this.cm.state.doc.toString().length !== 0) return false;
		const pos = this.getPos();
		this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize));
		this.view.focus();
		return true;
	}

	maybeEscape(_unit: string, dir: number): boolean {
		if (!this.cm) return false;
		const { main } = this.cm.state.selection;
		if (!main.empty) return false;
		if (dir < 0 ? main.from > 0 : main.to < this.cm.state.doc.length) return false;
		const targetPos = this.getPos() + (dir < 0 ? 0 : this.node.nodeSize);
		const selection = Selection.near(this.view.state.doc.resolve(targetPos), dir);
		this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView());
		this.view.focus();
		return true;
	}

	update(node: Node): boolean {
		if (node.type != this.node.type) return false;
		this.node = node;
		if (this.updating) return true;
		const newText = node.textContent;

		if (!this.cm) {
			// still plain text: keep the stand-in in sync so an offscreen edit (undo, collaborator
			// patch, disk reload) is what the reader sees if they scroll to it
			if (this.placeholder) setStaticCode(this.placeholder, newText);
			return true;
		}

		const curText = this.cm.state.doc.toString();
		if (newText != curText) {
			let start = 0;
			let curEnd = curText.length;
			let newEnd = newText.length;
			while (start < curEnd && curText.charCodeAt(start) == newText.charCodeAt(start)) ++start;
			while (curEnd > start && newEnd > start && curText.charCodeAt(curEnd - 1) == newText.charCodeAt(newEnd - 1)) {
				curEnd--;
				newEnd--;
			}
			this.updating = true;
			this.cm.dispatch({ changes: { from: start, to: curEnd, insert: newText.slice(start, newEnd) } });
			this.updating = false;
		}
		return true;
	}

	selectNode(): void {
		this.materialize();
		this.cm?.focus();
	}

	stopEvent(): boolean {
		// Once CodeMirror exists it owns everything inside the chip. While it is still plain text
		// there is nothing to own the events, so let ProseMirror handle the click and route it back
		// here through selectNode().
		return this.cm !== undefined;
	}

	destroy() {
		cancelUpgrade(this.dom);
		if (!this.cm) return;
		this.cm.dom.removeEventListener('blur', this.handleBlur, true);
		this.cm.destroy();
	}
}

export default InlineLatexView;
