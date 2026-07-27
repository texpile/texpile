// runs extractUserMacros off the main thread: the AST parse scales with the whole file and froze
// typing for seconds when a macro completion session (or hover) started after an edit.
import { extractUserMacros } from './userMacroScan';

self.onmessage = (event: MessageEvent<{ id: number; text: string }>) => {
	const { id, text } = event.data;
	(self as unknown as { postMessage: (m: unknown) => void }).postMessage({ id, macros: extractUserMacros(text) });
};
