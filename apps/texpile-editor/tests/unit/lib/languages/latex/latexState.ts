import { EditorState, type EditorStateConfig } from '@codemirror/state';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { latexOwnSyntax, ownSyntaxOf, setOwnSyntax } from '$lib/languages/latex/source/latexOwnSyntax';
import { extractUserDefinitions } from '$lib/languages/latex/intellisense/completion/userMacroScan';

export function latexState(doc: string, config: Omit<EditorStateConfig, 'doc'> = {}): EditorState {
	const state = EditorState.create({ ...config, doc, extensions: [latex(), latexOwnSyntax(), config.extensions ?? []] });
	return state.update({ effects: setOwnSyntax.of(ownSyntaxOf(extractUserDefinitions(doc))) }).state;
}
