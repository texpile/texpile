// runs the deeply recursive sync parser off the main thread; the client (latexParserClient.ts)
// terminates the worker after a wall-clock deadline to kill runaway parses. PM Nodes can't
// structured-clone, so the doc crosses as toJSON() and the client rehydrates via nodeFromJSON.
import { parseLatexFile } from './latexRoundtrip';

interface ParseRequest {
	id: number;
	source: string;
	projectMacros: string;
}

self.onmessage = (event: MessageEvent<ParseRequest>) => {
	const { id, source, projectMacros } = event.data;
	// keep it a call ON self: an unbound postMessage reference throws "Illegal invocation"
	const post = (m: unknown) => (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m);
	try {
		const parsed = parseLatexFile(source, projectMacros, (phase) => post({ type: 'progress', id, phase }));
		(self as unknown as { postMessage: (m: unknown) => void }).postMessage({
			type: 'result',
			id,
			preamble: parsed.preamble,
			postamble: parsed.postamble,
			hadDocumentEnv: parsed.hadDocumentEnv,
			warnings: parsed.warnings,
			docJSON: parsed.doc.toJSON()
		});
	} catch (err) {
		(self as unknown as { postMessage: (m: unknown) => void }).postMessage({
			type: 'error',
			id,
			message: err instanceof Error ? err.message : String(err)
		});
	}
};
