import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

import type { EditorState } from 'prosemirror-state';

/** where the focus is: in the editor, parked in a menu or dialog over it, or anywhere else on the page */
type Focus = 'editor' | 'overlay' | 'away';

const key = new PluginKey<Focus>('persistentSelection');

/** focus is outside the editor, so the browser is painting neither caret nor selection */
export function selectionHeldVisible(state: EditorState): boolean {
	const focus = key.getState(state);
	return focus === 'overlay' || focus === 'away';
}

// the browser stops painting an editor's selection once focus leaves it. As in the source editor, a
// selection stays drawn wherever the focus went: the range painter reads the flag above. A fake caret
// is drawn only while focus is parked in a transient overlay ([data-scope] menus/dialogs, or anything
// with [data-keep-caret]), where the reader is still working on the text
export function createPersistentSelectionPlugin() {
	return new Plugin<Focus>({
		key,
		state: {
			init: () => 'editor',
			apply(tr, focus) {
				return (tr.getMeta(key) as Focus | undefined) ?? focus;
			}
		},
		view(view) {
			function set(focus: Focus) {
				if (key.getState(view.state) !== focus) view.dispatch(view.state.tr.setMeta(key, focus));
			}
			function evaluate(active: Element | null) {
				if (active && view.dom.contains(active)) set('editor');
				else set(active?.closest('[data-scope], [data-keep-caret]') ? 'overlay' : 'away');
			}
			function onFocusIn() {
				evaluate(document.activeElement);
			}
			// focus going to nothing (a click on plain text, a panel's background) brings no focusin. Nor does
			// the window losing focus, where the browser goes on painting the selection itself
			function onFocusOut(e: FocusEvent) {
				if (!e.relatedTarget && document.hasFocus()) evaluate(null);
			}
			function onWindowBlur() {
				if (key.getState(view.state) === 'overlay') set('away');
			}
			// failsafe: if the user types a printable char while the fake caret shows and focus is on
			// something non-editable, redirect the keystroke into PM. non-text keys stay with the menu
			// so keyboard nav still works.
			function onKeyDown(e: KeyboardEvent) {
				if (key.getState(view.state) !== 'overlay') return;
				if (e.ctrlKey || e.metaKey || e.altKey) return; // accelerators / shortcuts
				if (e.key.length !== 1 || e.key === ' ') return; // only single printable chars, skip space
				const active = document.activeElement as HTMLElement | null;
				if (!active) return;
				if (view.dom.contains(active)) return;
				// real editable fields elsewhere keep the keystroke
				if (active.matches('input, textarea, [contenteditable="true"]')) return;
				if (active.tagName === 'MATH-FIELD') return; // mathlive's <math-field>
				// preventDefault stops any menu button's default action; insert the char ourselves
				e.preventDefault();
				view.focus();
				view.dispatch(view.state.tr.insertText(e.key));
			}
			document.addEventListener('focusin', onFocusIn, true);
			document.addEventListener('focusout', onFocusOut, true);
			document.addEventListener('keydown', onKeyDown, true);
			window.addEventListener('blur', onWindowBlur);
			return {
				destroy() {
					document.removeEventListener('focusin', onFocusIn, true);
					document.removeEventListener('focusout', onFocusOut, true);
					document.removeEventListener('keydown', onKeyDown, true);
					window.removeEventListener('blur', onWindowBlur);
				}
			};
		},
		props: {
			decorations(state) {
				if (key.getState(state) !== 'overlay') return null;
				const sel = state.selection;
				if (!sel.empty) return null;
				// use <sup>/<sub> for pending sup/sub marks so the fake caret sits where the real
				// one would; browsers style those natively so the ::before inherits it for free
				const marks = state.storedMarks ?? sel.$from.marks();
				const tag = marks.some((m) => m.type.name === 'sup') ? 'sup' : marks.some((m) => m.type.name === 'sub') ? 'sub' : 'span';
				const widget = Decoration.widget(
					sel.head,
					() => {
						const el = document.createElement(tag);
						el.className = 'pm-blur-cursor';
						return el;
					},
					// tag in the key so PM rebuilds the widget when the pending mark changes
					{ side: 0, key: `pm-blur-cursor:${tag}` }
				);
				return DecorationSet.create(state.doc, [widget]);
			}
		}
	});
}
