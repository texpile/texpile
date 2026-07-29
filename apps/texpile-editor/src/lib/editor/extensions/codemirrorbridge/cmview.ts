import { EditorView as CodeMirrorView, keymap as cmKeymap, drawSelection } from '@codemirror/view';
import { Compartment as CodeMirrorCompartment } from '@codemirror/state';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { cmSyntaxHighlight } from '$lib/editor/cmHighlight';
import { exitCode } from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import { TextSelection, Selection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';
import { languages as cmlangdata } from '@codemirror/language-data';
import { markdown } from '@codemirror/lang-markdown';
import { renderStaticCodeBlock, setStaticCode } from './cmStatic';
import { upgradeWhenNear, cancelUpgrade } from '$lib/editor/extensions/mathlivebridge/mathViewport';

class CodeBlockView {
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
	private dropdown?: HTMLSelectElement;
	private optionsFilled = false;

	constructor(node: Node, view: ProseMirrorView, getPos: () => number) {
		this.node = node;
		this.view = view;
		this.getPos = getPos;
		this.updating = false;

		const wrapper = document.createElement('div');
		wrapper.className = 'noautofocus cm-wrapper border-2 border-gray-1100 shadow-lg rounded-md p-2 m-1';
		this.dom = wrapper;

		this.dropdown = this.buildDropdown();
		wrapper.appendChild(this.dropdown);

		// Same reasoning as the inline chips: a CodeMirror instance per block is expensive, and a
		// block the reader cannot see does not need one. Plain text now, real editor on approach.
		this.placeholder = renderStaticCodeBlock(this.node.textContent);
		wrapper.appendChild(this.placeholder);

		this.handleFocus = this.handleFocus.bind(this);
		this.handleBlur = this.handleBlur.bind(this);

		upgradeWhenNear(this.dom, this.materialize);
	}

	/** The language picker holds one option per entry in @codemirror/language-data - around 150 DOM
	 * nodes - and the list is identical for every block. Show the current language as the only option
	 * until the picker is actually opened, then fill in the rest. */
	private buildDropdown(): HTMLSelectElement {
		const dropdown = document.createElement('select');
		dropdown.className =
			'noautofocus bg-surface-50-950 text-surface-900-100 border-surface-300-700 flex h-5 w-full items-center justify-center rounded border-[0.504px] text-xs font-medium';

		const current = document.createElement('option');
		current.value = current.text = this.node.attrs.lang || 'Markdown';
		dropdown.appendChild(current);

		dropdown.addEventListener('pointerdown', this.fillLanguageOptions);
		dropdown.addEventListener('focus', this.fillLanguageOptions);

		dropdown.addEventListener('change', async (event) => {
			const selectedLanguage = (event.target as HTMLSelectElement).value;
			const selectedLanguageData = cmlangdata.find((lang) => lang.name === selectedLanguage);
			if (!selectedLanguageData) return;
			this.view.dispatch(this.view.state.tr.setNodeMarkup(this.getPos(), undefined, { lang: selectedLanguage }));
			// changing the language is an interaction, so the editor must exist to reconfigure
			this.materialize();
			this.cm?.dispatch({ effects: this.languageConf.reconfigure(await selectedLanguageData.load()) });
		});
		return dropdown;
	}

	private fillLanguageOptions = (): void => {
		if (this.optionsFilled || !this.dropdown) return;
		this.optionsFilled = true;
		const selected = this.dropdown.value;
		this.dropdown.textContent = '';
		for (const lang of cmlangdata) {
			const option = document.createElement('option');
			option.value = option.text = lang.name;
			this.dropdown.appendChild(option);
		}
		this.dropdown.value = selected;
		this.dropdown.removeEventListener('pointerdown', this.fillLanguageOptions);
		this.dropdown.removeEventListener('focus', this.fillLanguageOptions);
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
				this.languageConf.of(markdown()),
				cmSyntaxHighlight(),
				CodeMirrorView.updateListener.of((update) => this.forwardUpdate(update as never)),
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
		const langData = cmlangdata.find((lang) => lang.name.toLowerCase() === currentlang?.toLowerCase());
		if (langData) {
			langData.load().then((lang) => {
				if (this.dropdown) this.dropdown.value = langData.name;
				cm.dispatch({
					effects: this.languageConf.reconfigure(lang)
				});
			});
		}

		cm.dom.addEventListener('focus', this.handleFocus, true);
		cm.dom.addEventListener('blur', this.handleBlur, true);
	};

	handleFocus() {}
	handleBlur() {
		this.deselectNode();
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	forwardUpdate(update: any): void {
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

	codeMirrorKeymap(): Array<unknown> {
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
		const selection = Selection.near(this.view.state.doc.resolve(targetPos), dir);
		const tr = this.view.state.tr.setSelection(selection).scrollIntoView();
		this.view.dispatch(tr);
		this.view.focus();
		return true;
	}

	update(node: Node): boolean {
		if (node.type != this.node.type) return false;
		this.node = node;
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

	stopEvent(): boolean {
		// Once CodeMirror exists it owns everything inside the block. While it is still plain text
		// there is nothing to own the events, so let ProseMirror handle the click and route it back
		// here through selectNode().
		return this.cm !== undefined;
	}
	// ProseMirror calls destroy(); this used to be spelled `destory`, so it never ran and every
	// removed code block leaked its CodeMirror instance and both capture listeners.
	destroy() {
		cancelUpgrade(this.dom);
		this.dropdown?.removeEventListener('pointerdown', this.fillLanguageOptions);
		this.dropdown?.removeEventListener('focus', this.fillLanguageOptions);
		if (!this.cm) return;
		this.cm.dom.removeEventListener('focus', this.handleFocus, true);
		this.cm.dom.removeEventListener('blur', this.handleBlur, true);
		this.cm.destroy();
	}
}

export default CodeBlockView;
