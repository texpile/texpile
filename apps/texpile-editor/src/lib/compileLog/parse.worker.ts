// worker entry: compile-log parsing off the renderer thread. the module is pure data-in/data-out,
// so the whole result structured-clones back as-is.
import { parseCompileDiagnostics } from './compileLog';
import type { Engine } from '$lib/workspace/compileCommand';

type ParseRequest = {
	id: number;
	logText: string;
	blgText: string | null;
	stdoutText: string | null;
	engine: Engine | null;
};

self.onmessage = (e: MessageEvent<ParseRequest>) => {
	const { id, logText, blgText, stdoutText, engine } = e.data;
	try {
		self.postMessage({ id, result: parseCompileDiagnostics(logText, blgText, stdoutText, { engine }) });
	} catch (err) {
		self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
	}
};
