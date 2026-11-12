import { it, expect, vi } from 'vitest';

const posted: { id: number }[] = [];
const worker = {
	postMessage: (msg: { id: number }) => void posted.push(msg),
	onmessage: null as ((e: MessageEvent) => void) | null,
	onerror: null
};
vi.mock('$lib/workspace/latexParserWorker', () => ({ latexParserWorker: () => worker, resetLatexParserWorker: () => {} }));

import { parseLatexFileAsync, PARSE_ABANDONED } from '$lib/workspace/latexParserClient';

// a parse the text has moved past was still rebuilt into a document when it came back: 80 ms of a long file's
// main thread for a result nobody takes
it('settles an abandoned parse at once and leaves its result alone', async () => {
	const abandon = new AbortController();
	const parse = parseLatexFileAsync('text', '', 3000, undefined, 0, 'tex', undefined, abandon.signal);
	abandon.abort();
	await expect(parse).rejects.toThrow(PARSE_ABANDONED);
	const result = { type: 'result', id: posted[0].id, docJSON: null };
	expect(() => worker.onmessage?.({ data: result } as MessageEvent)).not.toThrow();
});
