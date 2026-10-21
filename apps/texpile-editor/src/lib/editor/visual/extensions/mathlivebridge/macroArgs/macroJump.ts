// Go to Definition for the panel a math field opens; text chips get it from their node view
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';

type MacroJump = (name: string) => void;

const MACRO_JUMP = new PluginKey<MacroJump>('macro-jump');

export function macroJumpPlugin(jump: MacroJump): Plugin {
	return new Plugin({ key: MACRO_JUMP, state: { init: () => jump, apply: (_, kept) => kept } });
}

export function macroJumpOf(state: EditorState): MacroJump {
	return MACRO_JUMP.getState(state) ?? (() => {});
}
