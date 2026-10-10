// runs the deeply recursive sync parser off the main thread; the client (latexParserClient.ts)
// terminates the worker after a wall-clock deadline to kill runaway parses. PM Nodes can't
// structured-clone, so the doc crosses as toJSON() and the client rehydrates via nodeFromJSON.
import { parseLatexFile } from './latexRoundtrip';
import { parseMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { setCallWrappers } from '$lib/editor/snippets/visual/callWrappers';

type ParseRequest = {
	id: number;
	source: string;
	projectMacros: string;
	/** refuse to hand back a doc bigger than this; 0/undefined disables the check. */
	maxNodes?: number;
	/** source dialect; defaults to LaTeX. */
	format?: 'tex' | 'md';
	/** the macros a snippet file gives a look; the worker has no snippet files of its own */
	callWrappers?: string[];
};

self.onmessage = (event: MessageEvent<ParseRequest>) => {
	const { id, source, projectMacros, maxNodes, format, callWrappers } = event.data;
	setCallWrappers('latex', callWrappers ?? []);
	// keep it a call ON self: an unbound postMessage reference throws "Illegal invocation"
	function post(m: unknown) {
		return (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m);
	}
	try {
		const parse = format === 'md' ? parseMarkdownFile : parseLatexFile;
		const parsed = parse(source, projectMacros, (phase) => post({ type: 'progress', id, phase }));
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
			map: parsed.map,
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
