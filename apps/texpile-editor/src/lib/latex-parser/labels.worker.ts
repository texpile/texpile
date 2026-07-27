// runs extractDocRefs off the main thread: the AST parse scales with the whole file and froze
// the UI when WorkspaceView's debounce ran it inline on every typing pause.
import { extractDocRefs } from './labels';

self.onmessage = (event: MessageEvent<{ id: number; latex: string }>) => {
	const { id, latex } = event.data;
	(self as unknown as { postMessage: (m: unknown) => void }).postMessage({ id, refs: extractDocRefs(latex) });
};
