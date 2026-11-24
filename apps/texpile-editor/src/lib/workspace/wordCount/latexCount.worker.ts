// the open LaTeX file's word count, which reads the whole file: 600 ms of a 1.9 MB paper's main thread after each pause
import { countProse, latexProse } from './proseWords';

self.onmessage = (event: MessageEvent<{ id: number; text: string }>) => {
	const { id, text } = event.data;
	function post(m: unknown): void {
		(self as unknown as { postMessage: (m: unknown) => void }).postMessage(m);
	}
	try {
		post({ id, count: countProse(latexProse(text, true)) });
	} catch (err) {
		post({ id, error: err instanceof Error ? err.message : String(err) });
	}
};
