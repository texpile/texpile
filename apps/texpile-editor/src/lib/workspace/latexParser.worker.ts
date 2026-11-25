// runs the deeply recursive sync parser off the main thread; the client (latexParserClient.ts)
// terminates the worker after a wall-clock deadline to kill runaway parses. PM Nodes can't
// structured-clone, so the doc crosses as toJSON() and the client rehydrates via nodeFromJSON.
import { parseLatexFile, type ParsePhase } from './latexRoundtrip';
import { parseMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { scanDocument } from './documentScans';
import type { PackageTable } from '$lib/languages/latex/parser/signatures/packageTable';

type ParseRequest = {
	id: number;
	source: string;
	projectMacros: string;
	/** source dialect; defaults to LaTeX. */
	format?: 'tex' | 'md';
	table?: PackageTable;
};

self.onmessage = (event: MessageEvent<ParseRequest>) => {
	const { id, source, projectMacros, format, table } = event.data;
	// keep it a call ON self: an unbound postMessage reference throws "Illegal invocation"
	function post(m: unknown) {
		return (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m);
	}
	try {
		function onPhase(phase: ParsePhase) {
			post({ type: 'progress', id, phase });
		}
		const parsed =
			format === 'md' ? parseMarkdownFile(source, projectMacros, onPhase) : parseLatexFile(source, projectMacros, onPhase, table);
		post({
			type: 'result',
			id,
			preamble: parsed.preamble,
			postamble: parsed.postamble,
			hadDocumentEnv: parsed.hadDocumentEnv,
			warnings: parsed.warnings,
			map: parsed.map,
			docJSON: parsed.doc.toJSON(),
			scans: scanDocument(source)
		});
	} catch (err) {
		post({
			type: 'error',
			id,
			message: err instanceof Error ? err.message : String(err)
		});
	}
};
