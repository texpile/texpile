import { describe, it, expect } from 'vitest';
import { buildAnchor } from '$lib/comments/anchor';
import { anchorEvent, foldLog, openEvent, parseLog, placeEvent, serializeLog } from '$lib/comments/log';

const SRC = 'The introduction says something worth arguing with.\nThe conclusion says it again.\n';
const first = buildAnchor(SRC, SRC.indexOf('worth arguing with'), SRC.indexOf('worth arguing with') + 18);
const second = buildAnchor(SRC, SRC.indexOf('says it again'), SRC.indexOf('says it again') + 13);
const open = openEvent({ id: 'a', file: 'main.tex', anchor: first, body: 'note', by: 'test', at: '2026-01-01T00:00:00Z' });
const at = '2026-01-02T00:00:00Z';

describe('anchor events', () => {
	it('re-pins the thread and forgets the old placement verdict', () => {
		const [t] = foldLog([
			open,
			placeEvent({ thread: 'a', detached: true, by: 'test', at }),
			anchorEvent({ thread: 'a', anchor: second, by: 'agent', at })
		]);
		expect(t.anchor).toEqual(second);
		expect(t.file).toBe('main.tex');
		expect(t.detached).toBeUndefined();
	});

	it('carries the thread into another file when one is named', () => {
		const [t] = foldLog([open, anchorEvent({ thread: 'a', anchor: second, file: 'sections/outro.tex', by: 'agent', at })]);
		expect(t.file).toBe('sections/outro.tex');
	});

	it('survives the file, and a line missing its anchor is dropped', () => {
		const ev = anchorEvent({ thread: 'a', anchor: second, by: 'agent', at });
		expect(parseLog(serializeLog([open, ev]))).toEqual([open, ev]);
		expect(parseLog(JSON.stringify({ v: 1, t: 'anchor', thread: 'a', by: 'agent', at }))).toEqual([]);
	});
});
