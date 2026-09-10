import {
	findReferencesKeymap,
	formatKeymap,
	hoverTooltips,
	jumpToDefinitionKeymap,
	renameKeymap,
	serverDiagnostics,
	signatureHelp
} from '@codemirror/lsp-client';
import { keymap } from '@codemirror/view';
import { typstCompletion } from './typstCompletionSource';

export function typstServerExtensions() {
	return [
		typstCompletion(),
		hoverTooltips(),
		keymap.of([...formatKeymap, ...renameKeymap, ...jumpToDefinitionKeymap, ...findReferencesKeymap]),
		signatureHelp(),
		serverDiagnostics()
	];
}
