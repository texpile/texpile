import { it, expect, vi } from 'vitest';

const posted: { id: number }[] = [];
let resets = 0;
const worker = {
	postMessage: (msg: { id: number }) => void posted.push(msg),
	onmessage: null as ((e: MessageEvent) => void) | null,
	onerror: null
};
vi.mock('$lib/workspace/latexParserWorker', () => ({ latexParserWorker: () => worker, resetLatexParserWorker: () => resets++ }));

import { parseLatexFileAsync, PARSE_ABANDONED } from '$lib/workspace/latexParserClient';

// a parse the text has moved past was still rebuilt into a document when it came back: 80 ms of a long file's
// main thread for a result nobody takes
it('settles an abandoned parse at once and leaves its result alone', async () => {
	const abandon = new AbortController();
	const parse = parseLatexFileAsync('text', '', 3000, undefined, 'tex', undefined, abandon.signal);
	abandon.abort();
	await expect(parse).rejects.toThrow(PARSE_ABANDONED);
	const result = { type: 'result', id: posted.at(-1)!.id, docJSON: null };
	expect(() => worker.onmessage?.({ data: result } as MessageEvent)).not.toThrow();
});

// opening a long paper from another file: the left file's parse, queued behind it, ran out of time and terminated
// the worker in the middle of the paper, which then sat out its own deadline and opened in source
it('times a queued parse from when the worker takes it up', async () => {
	vi.useFakeTimers();
	posted.length = 0;
	void parseLatexFileAsync('long paper', '', 20_000).catch(() => {});
	void parseLatexFileAsync('short file', '', 3000).catch(() => {});
	await vi.advanceTimersByTimeAsync(10_000);
	expect(resets).toBe(0);
	expect(posted).toHaveLength(1);
	worker.onmessage?.({ data: { type: 'error', id: posted[0].id, message: 'done' } } as MessageEvent);
	await vi.advanceTimersByTimeAsync(0);
	expect(posted).toHaveLength(2);
	vi.useRealTimers();
});
