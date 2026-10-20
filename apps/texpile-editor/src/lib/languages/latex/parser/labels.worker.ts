// runs extractDocRefs off the main thread: the scan covers the whole file (0.3 s for 2 MB), too long inline on every typing pause
import { extractDocRefs } from './labels';

self.onmessage = (event: MessageEvent<{ id: number; latex: string }>) => {
	const { id, latex } = event.data;
	(self as unknown as { postMessage: (m: unknown) => void }).postMessage({ id, refs: extractDocRefs(latex) });
};
