// runs the deeply recursive sync parser off the main thread; the client (latexParserClient.ts)
// terminates the worker after a wall-clock deadline to kill runaway parses. PM Nodes can't
// structured-clone, so the doc crosses as toJSON() and the client rehydrates via nodeFromJSON.
import { parseLatexFile } from './latexRoundtrip';

interface ParseRequest {
	id: number;
	source: string;
	projectMacros: string;
	/** refuse to hand back a doc bigger than this; 0/undefined disables the check. */
	maxNodes?: number;
}

self.onmessage = (event: MessageEvent<ParseRequest>) => {
	const { id, source, projectMacros, maxNodes } = event.data;
	// keep it a call ON self: an unbound postMessage reference throws "Illegal invocation"
	const post = (m: unknown) => (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m);
	try {
		const parsed = parseLatexFile(source, projectMacros, (phase) => post({ type: 'progress', id, phase }));
		// ProseMirror renders every node eagerly (no virtualization) and builds a node view per
		// math/raw/citation node, so an oversized doc locks the renderer for minutes. Decide HERE:
		// rejecting before toJSON also skips serializing and cloning a doc we'd only throw away.
		let nodeCount = 0;
		parsed.doc.descendants(() => {
			nodeCount++;
			return true;
		});
		if (maxNodes && nodeCount > maxNodes) {
			post({ type: 'too-complex', id, nodeCount });
			return;
		}
		post({
			type: 'result',
			id,
			preamble: parsed.preamble,
			postamble: parsed.postamble,
			hadDocumentEnv: parsed.hadDocumentEnv,
			warnings: parsed.warnings,
			docJSON: parsed.doc.toJSON()
		});
	} catch (err) {
		post({
			type: 'error',
			id,
			message: err instanceof Error ? err.message : String(err)
		});
	}
};
