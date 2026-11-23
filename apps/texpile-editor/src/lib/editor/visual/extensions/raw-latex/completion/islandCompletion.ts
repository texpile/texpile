// LaTeX completion in a raw LaTeX chip or block, as its CodeMirror ran it in the DOM editor: the source editor's
// completion sources on a CodeMirror state of the chip's text, the list under the word, and a snippet's fields for Tab
import { Plugin, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
	autocompletion,
	clearSnippet,
	CompletionContext,
	hasNextSnippetField,
	hasPrevSnippetField,
	nextSnippetField,
	pickedCompletion,
	prevSnippetField,
	type CompletionResult
} from '@codemirror/autocomplete';
import { EditorSelection, Transaction as CodeTransaction, type EditorState as CodeState, type TransactionSpec } from '@codemirror/state';
import type { EditorView as CMView } from '@codemirror/view';
import { latexCompletionSource } from '$lib/languages/latex/intellisense/completion/dispatch';
import { recordAccept } from '$lib/languages/latex/intellisense/completion/frecency';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { islandCodeState, islandOf, writeBack, type FoundIsland } from '$lib/editor/canvas';
import { matchOptions, type MatchedOption } from './completionMatch';
import { hideCompletionMenu, selectCompletionAt, showCompletionMenu } from './completionMenu.svelte';

// the source editor's trigger contexts after a deletion (intellisense.ts), as CodeMirror only asks again on typing
const TEX_CONTEXT =
	/\\(?:[a-zA-Z]*|(?:left|[Bb]ig{1,2}[lmr]?)?(?:[({[|]|\\[{|])?)$|\\.*(?:\{[^{}]*|\[[^\]]*)$|\\begin\{[^{}\s]+\}$|[\^_]\{[^{}]*$|@@?[^\s@]*$/;
const PAGE = 8;

/** the one replacement that turns `before` into `after`, so a snippet's fields map through what was typed */
function textChange(before: string, after: string): { from: number; to: number; insert: string } | null {
	if (before === after) return null;
	let from = 0;
	while (from < before.length && from < after.length && before[from] === after[from]) from++;
	let end = 0;
	while (end < before.length - from && end < after.length - from && before[before.length - 1 - end] === after[after.length - 1 - end])
		end++;
	return { from, to: before.length - end, insert: after.slice(from, after.length - end) };
}

function latexIsland(view: Pick<EditorView, 'state'>): FoundIsland | null {
	const found = islandOf(view);
	if (!found || found.island.type.name === 'code_block') return null;
	return String(found.island.attrs.lang ?? 'latex') === 'latex' ? found : null;
}

class IslandCompletion {
	private code: CodeState | null = null;
	private start = -1;
	private matches: MatchedOption[] = [];
	private selected = 0;
	private asked = 0;
	private typed: 'insert' | 'delete' | null = null;

	constructor(private readonly view: EditorView) {}

	get open(): boolean {
		return this.matches.length > 0;
	}

	noteTyping(kind: 'insert' | 'delete'): void {
		this.typed = kind;
	}

	/** the chip's text as CodeMirror holds it: the same state while it matches, so a snippet's fields last */
	private codeNow(found: FoundIsland): CodeState {
		const text = found.island.textContent;
		const { anchor, head } = this.view.state.selection;
		const selection = EditorSelection.single(anchor - found.start, head - found.start);
		if (this.code && this.start === found.start) {
			const changes = textChange(this.code.doc.toString(), text);
			if (changes || !this.code.selection.eq(selection)) this.code = this.code.update({ changes: changes ?? undefined, selection }).state;
			return this.code;
		}
		this.code = islandCodeState(this.view, found, [latex(), autocompletion()]);
		this.start = found.start;
		return this.code;
	}

	update(prev: EditorState): void {
		const found = latexIsland(this.view);
		const typed = this.typed;
		this.typed = null;
		if (!found) {
			this.code = null;
			return this.close();
		}
		const code = this.codeNow(found);
		const pos = code.selection.main.head;
		const line = code.doc.lineAt(pos);
		if (typed === 'insert' || (typed === 'delete' && (this.open || TEX_CONTEXT.test(line.text.slice(0, pos - line.from)))))
			void this.ask(false);
		else if (this.open && !prev.selection.eq(this.view.state.selection)) void this.ask(false);
	}

	async ask(explicit: boolean): Promise<void> {
		const found = latexIsland(this.view);
		if (!found) return;
		const code = this.codeNow(found);
		const asked = ++this.asked;
		const pos = code.selection.main.head;
		const results = (await Promise.all([latexCompletionSource(new CompletionContext(code, pos, explicit))])).filter(
			(result): result is CompletionResult => !!result
		);
		if (asked !== this.asked || this.view.isDestroyed || this.codeNow(found) !== code) return;
		this.matches = matchOptions(results, code.doc.toString(), pos);
		this.selected = 0;
		if (!this.matches.length) return this.close();
		showCompletionMenu(this.view, found.start + this.matches[0].from, this.matches, (index) => this.accept(index));
	}

	close(): void {
		this.asked++;
		if (!this.matches.length) return;
		this.matches = [];
		hideCompletionMenu();
	}

	move(by: number): void {
		const count = this.matches.length;
		this.selected = (((this.selected + by) % count) + count) % count;
		selectCompletionAt(this.selected);
	}

	/** what completion and snippet commands take for an editor: the chip's state, with its changes written into the document */
	private target(): CMView {
		const now = (): { found: FoundIsland; code: CodeState } | null => {
			const found = latexIsland(this.view);
			return found && { found, code: this.codeNow(found) };
		};
		const stateNow = (): CodeState | null => now()?.code ?? this.code;
		const dispatch = (...specs: (TransactionSpec | CodeTransaction)[]): void => {
			const at = now();
			if (!at || this.view.isDestroyed) return;
			const tr = specs[0] instanceof CodeTransaction ? specs[0] : at.code.update(...(specs as TransactionSpec[]));
			// startCompletion asks for the list again without a change
			if (!tr.docChanged && !tr.selection) {
				void this.ask(true);
				return;
			}
			this.view.dispatch(writeBack(this.view, at.found.start, tr));
			this.code = tr.state;
		};
		return {
			get state() {
				return stateNow();
			},
			dispatch
		} as unknown as CMView;
	}

	accept(index = this.selected): boolean {
		const match = this.matches[index];
		const found = latexIsland(this.view);
		if (!match || !found) return false;
		this.close();
		const { option, from, to } = match;
		const target = this.target();
		if (typeof option.apply === 'function') option.apply(target, option, from, to);
		else {
			const insert = option.apply ?? option.label;
			target.dispatch({
				changes: { from, to, insert },
				selection: { anchor: from + insert.length },
				annotations: pickedCompletion.of(option)
			});
		}
		recordAccept(option.label);
		return true;
	}

	snippetField(dir: 1 | -1): boolean {
		const found = latexIsland(this.view);
		if (!found) return false;
		const code = this.codeNow(found);
		if (dir > 0 ? !hasNextSnippetField(code) : !hasPrevSnippetField(code)) return false;
		return (dir > 0 ? nextSnippetField : prevSnippetField)(this.target());
	}

	leaveSnippet(): boolean {
		return !!latexIsland(this.view) && clearSnippet(this.target());
	}

	keyDown(event: KeyboardEvent): boolean {
		const mod = event.ctrlKey || event.metaKey;
		if (this.open) {
			if (event.key === 'ArrowDown' && !mod) return (this.move(1), true);
			if (event.key === 'ArrowUp' && !mod) return (this.move(-1), true);
			if (event.key === 'PageDown') return (this.move(PAGE), true);
			if (event.key === 'PageUp') return (this.move(-PAGE), true);
			if ((event.key === 'Enter' || event.key === 'Tab') && !mod && !event.shiftKey) return this.accept();
			if (event.key === 'Escape') return (this.close(), true);
		}
		if (event.key === ' ' && event.ctrlKey && latexIsland(this.view)) return (void this.ask(true), true);
		if (event.key === 'Tab' && !mod) return this.snippetField(event.shiftKey ? -1 : 1);
		if (event.key === 'Escape') return this.leaveSnippet();
		if (event.key === 'Backspace' || event.key === 'Delete') this.typed = 'delete';
		return false;
	}

	destroy(): void {
		this.close();
	}
}

const controllers = new WeakMap<EditorView, IslandCompletion>();

export function islandCompletionPlugin(): Plugin {
	return new Plugin({
		props: {
			handleKeyDown: (view, event) => controllers.get(view)?.keyDown(event) ?? false,
			handleTextInput(view) {
				controllers.get(view)?.noteTyping('insert');
				return false;
			}
		},
		view(view) {
			const completion = new IslandCompletion(view);
			controllers.set(view, completion);
			function blurred(event: FocusEvent): void {
				if (!(event.relatedTarget instanceof Node) || !view.dom.contains(event.relatedTarget)) completion.close();
			}
			view.dom.addEventListener('focusout', blurred);
			return {
				update: (_view, prev) => completion.update(prev),
				destroy() {
					view.dom.removeEventListener('focusout', blurred);
					completion.destroy();
					controllers.delete(view);
				}
			};
		}
	});
}
