import { EditorView as CodeMirrorView, keymap as cmKeymap, drawSelection, type ViewUpdate, type KeyBinding } from '@codemirror/view';
import { Compartment as CodeMirrorCompartment, EditorState } from '@codemirror/state';
import { cmSyntaxHighlight } from '$lib/editor/source/cmHighlight';
import { cursorLineDown, cursorLineUp } from '@codemirror/commands';
import { exitCode } from 'prosemirror-commands';
import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
import { positionOnAdjacentLine } from '$lib/editor/visual/verticalExit';
import { TextSelection, Selection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';
import { languages as cmlangdata } from '@codemirror/language-data';
import { latexAutocomplete } from '$lib/languages/latex/intellisense/intellisense';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { renderStaticInlineCode, setStaticCode } from '$lib/editor/visual/extensions/codemirrorbridge/cmStatic';
import { cmCommentHighlights, cmCommentClicks, syncCmCommentHighlights } from '$lib/editor/visual/extensions/codemirrorbridge/cmComments';
import { upgradeWhenNear, cancelUpgrade } from '$lib/editor/visual/extensions/mathlivebridge/mathViewport';

// single-line inline codemirror for inline_latex; new newlines rejected, enter / arrow-out exit the node

/**
 * Rejects transactions that ADD lines - measured against the transaction's own start, never a
 * flat `lines > 1`. A chip whose captured source slice already spans lines (a multi-line
 * \caption, a macro with an embedded % comment, whose newline is semantically load-bearing)
 * would otherwise have EVERY transaction rejected: the caret froze, typing died, and even the
 * language reconfigure was swallowed, which is why such chips rendered unhighlighted.
 */
export const singleLineGuard = EditorState.transactionFilter.of((tr) => (tr.newDoc.lines > tr.startState.doc.lines ? [] : tr));

export class InlineLatexView {
	node: Node;
	view: ProseMirrorView;
	getPos: () => number;
	/** undefined until materialize() runs */
	cm?: CodeMirrorView;
	dom: HTMLElement;
	updating = false;
	languageConf = new CodeMirrorCompartment();
	// Chromium walks a vertical caret move into any editable island on the line, so a chip that does
	// not hold the caret is kept non-editable: ArrowUp from the text after a chip otherwise lands in
	// the chip, and the next ArrowUp comes back out, forever
	private editableConf = new CodeMirrorCompartment();
	/** plain-text stand-in until this chip nears the viewport */
	private placeholder?: HTMLElement;

	constructor(node: Node, view: ProseMirrorView, getPos: () => number) {
		this.node = node;
		this.view = view;
		this.getPos = getPos;

		const wrapper = document.createElement('span');
		// layout only; the chip's own look lives with the schema-rendered one in app.css
		wrapper.className = 'noautofocus inline-latex-wrapper inline-block align-baseline';
		this.dom = wrapper;
		this.syncCommentClass();

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
				this.editableConf.of(CodeMirrorView.editable.of(false)),
				drawSelection(),
				this.languageConf.of([]),
				cmSyntaxHighlight(),
				cmCommentHighlights,
				cmCommentClicks(this.view, () => this.getPos()),
				// popup escapes the inline node's box; only latex content has completions to offer
				...(String(this.node.attrs.lang ?? 'latex') === 'latex' ? [latexAutocomplete({ tooltipsInBody: true })] : []),
				singleLineGuard,
				// soft-wrap long inline blocks instead of pushing past the page width; still one logical line
				CodeMirrorView.lineWrapping,
				// inline-block shrink-to-fit keeps short macros tight, max-width + lineWrapping wraps long ones
				CodeMirrorView.theme({
					'&': { backgroundColor: 'transparent', display: 'inline-block', verticalAlign: 'baseline', maxWidth: '100%' },
					// the document's own face, not a monospace one: a chip stands inside a sentence, and
					// its syntax colour already says it is source
					'.cm-scroller': { fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', overflow: 'visible' },
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
		// attrs.lang picks the mode, same contract as the block RawLatexView (md html/markdown chips)
		if (String(this.node.attrs.lang ?? 'latex') === 'typst') {
			// typst isn't in @codemirror/language-data; the app ships its own wasm-backed language
			// (island flavour: no fold gutter on a chip)
			void import('$lib/languages/typst/source/typstLanguage').then(({ typstIslandLanguage }) =>
				cm.dispatch({ effects: this.languageConf.reconfigure(typstIslandLanguage()) })
			);
		} else if (String(this.node.attrs.lang ?? 'latex') === 'latex') {
			// the app's own LaTeX mode, same tags and colours as the source editor
			cm.dispatch({ effects: this.languageConf.reconfigure(latex()) });
		} else {
			const langName = { html: 'HTML', markdown: 'Markdown' }[String(this.node.attrs.lang ?? 'latex')] ?? 'HTML';
			const langData = cmlangdata.find((lang) => lang.name === langName);
			langData?.load().then((lang) => cm.dispatch({ effects: this.languageConf.reconfigure(lang) }));
		}

		cm.dom.addEventListener('blur', this.handleBlur, true);
		// capture phase, so the content is editable by the time CodeMirror handles the click
		cm.dom.addEventListener('mousedown', this.wakeOnMouse, true);

		this.lastCommentKey = syncCmCommentHighlights(cm, this.view, () => this.getPos(), this.node, this.lastCommentKey);
	};

	/** last comment ranges handed to CodeMirror, so a no-op update doesn't dispatch */
	private lastCommentKey = '[]';

	private setEditable(on: boolean): void {
		if (!this.cm || this.cm.state.facet(CodeMirrorView.editable) === on) return;
		this.cm.dispatch({ effects: this.editableConf.reconfigure(CodeMirrorView.editable.of(on)) });
	}

	private wakeOnMouse = (): void => this.setEditable(true);

	handleBlur() {
		this.setEditable(false);
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
		this.setEditable(true);
		this.cm.focus();
		this.updating = true;
		this.cm.dispatch({ selection: { anchor, head } });
		this.updating = false;
	}

	codeMirrorKeymap(): KeyBinding[] {
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
			// a soft-wrapped chip moves within itself first; from its top or bottom line the caret
			// goes to the document line above or below, the way it would from plain text
			{ key: 'ArrowUp', run: (cm) => (this.onEdgeLine(-1) ? this.escapeVertically(-1) : cursorLineUp(cm)) },
			{ key: 'ArrowDown', run: (cm) => (this.onEdgeLine(1) ? this.escapeVertically(1) : cursorLineDown(cm)) },
			{ key: 'Enter', run: exit },
			{ key: 'Ctrl-Enter', mac: 'Cmd-Enter', run: exit },
			{ key: 'Ctrl-z', mac: 'Cmd-z', run: () => undoVisual() },
			{ key: 'Shift-Ctrl-z', mac: 'Shift-Cmd-z', run: () => redoVisual() },
			{ key: 'Ctrl-y', mac: 'Cmd-y', run: () => redoVisual() },
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

	/** whether the caret sits on the chip's first (dir -1) or last (dir 1) visual line */
	onEdgeLine(dir: -1 | 1): boolean {
		if (!this.cm) return true;
		const here = this.cm.coordsAtPos(this.cm.state.selection.main.head);
		const edge = this.cm.coordsAtPos(dir < 0 ? 0 : this.cm.state.doc.length);
		if (!here || !edge) return true;
		return dir < 0 ? here.top < edge.bottom : here.bottom > edge.top;
	}

	/** the line above or below the chip, at the chip's edge column; the edge itself when there is none */
	escapeVertically(dir: -1 | 1): boolean {
		const edge = this.getPos() + (dir < 0 ? 0 : this.node.nodeSize);
		const target = positionOnAdjacentLine(this.view, edge, dir) ?? edge;
		const selection = Selection.near(this.view.state.doc.resolve(target), dir);
		this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView());
		this.view.focus();
		return true;
	}

	/** A comment chip owns its whole line in the source (% consumes to end of line) and the
	 * serializer emits it that way, so display it on a line of its own too. Class-based so an
	 * edit that adds or removes the leading % moves the chip in or out of line flow. */
	private syncCommentClass(): void {
		this.dom.classList.toggle('comment-chip', this.node.textContent.startsWith('%'));
	}

	update(node: Node): boolean {
		if (node.type != this.node.type) return false;
		this.node = node;
		this.syncCommentClass();
		// decoration-only changes (a comment placed, focused, or dismissed) arrive here too
		if (this.cm) this.lastCommentKey = syncCmCommentHighlights(this.cm, this.view, () => this.getPos(), this.node, this.lastCommentKey);
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
		this.setEditable(true);
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
		this.cm.dom.removeEventListener('mousedown', this.wakeOnMouse, true);
		this.cm.destroy();
	}
}
