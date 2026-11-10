import { findReferencesKeymap, formatKeymap, hoverTooltips, LSPPlugin, renameKeymap, signatureHelp } from '@codemirror/lsp-client';
import { keymap, ViewPlugin } from '@codemirror/view';
import { typstCompletion } from './completion/typstCompletionSource';
import { typstDiagnosticCards } from './serverDiagnosticCards';

const syncOnChange = ViewPlugin.define(() => ({
	update(u) {
		if (u.docChanged) queueMicrotask(() => LSPPlugin.get(u.view)?.client.sync());
	}
}));

export function typstServerExtensions() {
	return [
		syncOnChange,
		typstCompletion(),
		hoverTooltips(),
		// no jumpToDefinitionKeymap: F12 is typstGoTo's (goToDefinition.ts), which reads tinymist's
		// LocationLink answers and opens other files; the client's reads neither
		keymap.of([...formatKeymap, ...renameKeymap, ...findReferencesKeymap]),
		signatureHelp(),
		typstDiagnosticCards()
	];
}
