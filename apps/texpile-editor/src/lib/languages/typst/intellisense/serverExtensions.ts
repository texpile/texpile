import { findReferencesKeymap, formatKeymap, hoverTooltips, renameKeymap, serverDiagnostics, signatureHelp } from '@codemirror/lsp-client';
import { keymap } from '@codemirror/view';
import { typstCompletion } from './completion/typstCompletionSource';

export function typstServerExtensions() {
	return [
		typstCompletion(),
		hoverTooltips(),
		// no jumpToDefinitionKeymap: F12 is typstGoTo's (goToDefinition.ts), which reads tinymist's
		// LocationLink answers and opens other files; the client's reads neither
		keymap.of([...formatKeymap, ...renameKeymap, ...findReferencesKeymap]),
		signatureHelp(),
		serverDiagnostics()
	];
}
