// worker entry: compile-log parsing off the renderer thread. the module is pure data-in/data-out,
// so the whole result structured-clones back as-is.
import { parseCompileDiagnostics } from './index';

interface ParseRequest {
	id: number;
	logText: string;
	blgText: string | null;
	stdoutText: string | null;
}

self.onmessage = (e: MessageEvent<ParseRequest>) => {
	const { id, logText, blgText, stdoutText } = e.data;
	try {
		self.postMessage({ id, result: parseCompileDiagnostics(logText, blgText, stdoutText) });
	} catch (err) {
		self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
	}
};
