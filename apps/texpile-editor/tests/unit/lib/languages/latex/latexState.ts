import { EditorState, type EditorStateConfig } from '@codemirror/state';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { latexOwnMath, setOwnMath } from '$lib/languages/latex/source/latexOwnMath';
import { ownMathOf } from '$lib/languages/latex/syntax/ownMath';
import { extractUserDefinitions } from '$lib/languages/latex/intellisense/completion/userMacroScan';

export function latexState(doc: string, config: Omit<EditorStateConfig, 'doc'> = {}): EditorState {
	const state = EditorState.create({ ...config, doc, extensions: [latex(), latexOwnMath(), config.extensions ?? []] });
	return state.update({ effects: setOwnMath.of(ownMathOf(extractUserDefinitions(doc))) }).state;
}
