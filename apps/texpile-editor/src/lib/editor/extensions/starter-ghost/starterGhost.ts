// An empty .tex offers a document skeleton as ghost text; Tab takes it. Nothing is written to
// the file unless the user accepts, so a preamble is never forced on someone who has their own.
// Only source mode gets this: visual-mode users are handed the skeleton at creation instead
// (see createInTree in WorkspaceView), because ghost text has no meaning in a WYSIWYG surface.
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from '@codemirror/view';
import { Prec, StateField, type Extension } from '@codemirror/state';
import { createStarterLatex } from '$lib/workspace/latexRoundtrip';

const STARTER = createStarterLatex();
/** land the cursor on the blank body line, not at the very start of the inserted text */
const BODY_OFFSET = STARTER.indexOf('\\begin{document}') + '\\begin{document}\n'.length;

class StarterGhostWidget extends WidgetType {
	toDOM(): HTMLElement {
		const el = document.createElement('span');
		el.className = 'cm-starter-ghost';
		el.textContent = STARTER.replace(/\n+$/, '');
		el.setAttribute('aria-hidden', 'true'); // decorative: the hint line below carries the offer
		const hint = document.createElement('span');
		hint.className = 'cm-starter-ghost-hint';
		hint.textContent = '\n\nPress Tab to insert, or just start typing.';
		el.appendChild(hint);
		return el;
	}
	// ghost text is not a click target; let clicks fall through to the editor
	ignoreEvent(): boolean {
		return false;
	}
	eq(): boolean {
		return true;
	}
}

const ghostDeco = Decoration.widget({ widget: new StarterGhostWidget(), side: 1 });

/** the offer stands only while the file is genuinely untouched */
const isBlank = (view: { state: { doc: { length: number; toString(): string } } }) =>
	view.state.doc.length === 0 || /^\s*$/.test(view.state.doc.toString());

const ghostField = StateField.define<DecorationSet>({
	create(state) {
		return state.doc.length === 0 ? Decoration.set([ghostDeco.range(0)]) : Decoration.none;
	},
	update(_deco, tr) {
		return isBlank({ state: tr.state }) ? Decoration.set([ghostDeco.range(0)]) : Decoration.none;
	},
	provide: (f) => EditorView.decorations.from(f)
});

function acceptStarter(view: EditorView): boolean {
	if (!isBlank(view)) return false; // no offer on screen: let Tab indent as usual
	view.dispatch({
		changes: { from: 0, to: view.state.doc.length, insert: STARTER },
		selection: { anchor: BODY_OFFSET },
		userEvent: 'input.complete'
	});
	return true;
}

const ghostTheme = EditorView.baseTheme({
	'.cm-starter-ghost': {
		opacity: '0.42',
		whiteSpace: 'pre',
		pointerEvents: 'none',
		userSelect: 'none'
	},
	'.cm-starter-ghost-hint': {
		fontStyle: 'italic'
	}
});

/** ghost-text starter skeleton for an empty .tex, accepted with Tab. */
export function starterGhost(): Extension {
	// Prec.high so Tab reaches us before indentWithTab; acceptStarter returns false when there's
	// no ghost, so indentation still works everywhere else.
	return [ghostField, ghostTheme, Prec.high(keymap.of([{ key: 'Tab', run: acceptStarter }]))];
}
