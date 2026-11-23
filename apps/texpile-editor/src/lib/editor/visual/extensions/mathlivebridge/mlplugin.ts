import { NodeSelection, Plugin, PluginKey, TextSelection, type PluginSpec, type Selection } from 'prosemirror-state';

export type MathLivePluginState = {
	/** cursor pos before entering a math node, decides front vs back placement on expand. */
	prevCursorPos: number;
};
export const MATHLIVE_PLUGIN_KEY = new PluginKey<MathLivePluginState>('prosemirror-mathlive');

/** the inline formula the selection was on or in, -1 for none */
function formulaHeld(selection: Selection): number {
	if (selection instanceof NodeSelection) return selection.node.type.name === 'inline_math' ? selection.from : -1;
	return selection.$from.parent.type.name === 'inline_math' ? selection.$from.before() : -1;
}

const mathPluginSpec: PluginSpec<MathLivePluginState> = {
	key: MATHLIVE_PLUGIN_KEY,
	state: {
		init() {
			return {
				prevCursorPos: 0
			};
		},
		apply(tr, value, oldState) {
			return {
				prevCursorPos: oldState.selection.from
			};
		}
	},
	// a command or a collaborator could leave the caret in an equation's text, where typing went nowhere and Ctrl+M threw;
	// unless it came from the equation being edited, the caret goes beside the equation
	appendTransaction(trs, old, state) {
		const { selection } = state;
		if (!trs.some((tr) => tr.selectionSet) || !(selection instanceof TextSelection) || !selection.empty) return null;
		const $caret = selection.$from;
		if ($caret.parent.type.name !== 'inline_math') return null;
		const held = formulaHeld(old.selection);
		if (held >= 0 && trs.reduce((pos, tr) => tr.mapping.map(pos), held) === $caret.before()) return null;
		return state.tr.setSelection(TextSelection.create(state.doc, $caret.parentOffset === 0 ? $caret.before() : $caret.after()));
	}
};

export const mathlivePlugin = new Plugin(mathPluginSpec);

export { mlarrowHandlers } from './mlArrowHandlers';
