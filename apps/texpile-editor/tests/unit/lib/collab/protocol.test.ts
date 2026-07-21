import { describe, it, expect } from 'vitest';
import {
	FrameType,
	encodeFrame,
	decodeFrame,
	chunkBlob,
	BlobAssembler,
	BLOB_CHUNK_SIZE,
	parseRelayNotice,
	isSafeRel,
	BROADCAST,
	type Frame
} from '$lib/collab/protocol';

describe('collab protocol', () => {
	it('round-trips every frame type', () => {
		const frames: Frame[] = [
			{ type: FrameType.Sync, from: 7, to: BROADCAST, payload: new Uint8Array([1, 2, 3]) },
			{ type: FrameType.Awareness, from: 7, to: 9, payload: new Uint8Array(0) },
			{ type: FrameType.Hello, from: 1, to: BROADCAST, payload: { name: 'Ada', color: '#f00', role: 'guest' } },
			{ type: FrameType.BlobRequest, from: 2, to: 3, name: 'pdf' },
			{ type: FrameType.BlobChunk, from: 3, to: 2, payload: { name: 'pdf', rev: 4, index: 1, total: 2, bytes: new Uint8Array([9]) } },
			{ type: FrameType.Control, from: 2, to: BROADCAST, payload: { kind: 'compile-request' } },
			{ type: FrameType.Control, from: 4, to: BROADCAST, payload: { kind: 'file-op', op: 'rename', from: 'a.tex', to: 'b/c.tex' } }
		];
		for (const f of frames) expect(decodeFrame(encodeFrame(f))).toEqual(f);
	});

	// the host runs guest file-ops against its real disk, so this is the traversal gate
	it('isSafeRel admits manifest-relative paths and nothing that escapes the root', () => {
		for (const ok of ['a.tex', 'chapters/intro.tex', 'a b/fig.png', '.gitignore']) expect(isSafeRel(ok), ok).toBe(true);
		for (const bad of ['', '/etc/passwd', 'C:/x', 'c:\\x', '..', '../x', 'a/../../x', 'a\\b', 'a//b', 'a/./b', 'a/']) {
			expect(isSafeRel(bad), bad).toBe(false);
		}
	});

	it('chunks and reassembles blobs, including chunk-boundary sizes', () => {
		for (const size of [0, 1, BLOB_CHUNK_SIZE, BLOB_CHUNK_SIZE + 1, BLOB_CHUNK_SIZE * 2 + 17]) {
			const bytes = new Uint8Array(size).map((_, i) => i % 251);
			const chunks = chunkBlob('pdf', 1, bytes);
			expect(chunks.length).toBe(Math.max(1, Math.ceil(size / BLOB_CHUNK_SIZE)));
			const asm = new BlobAssembler();
			let out: Uint8Array | null = null;
			// deliver out of order to prove index handling
			for (const c of [...chunks].reverse()) out = asm.add(c) ?? out;
			expect(out && new Uint8Array(out)).toEqual(bytes);
		}
	});

	it('a newer rev obsoletes a half-finished older transfer', () => {
		const asm = new BlobAssembler();
		const oldChunks = chunkBlob('pdf', 1, new Uint8Array(BLOB_CHUNK_SIZE + 1));
		expect(asm.add(oldChunks[0])).toBeNull();
		const fresh = new Uint8Array([5, 6, 7]);
		expect(asm.add(chunkBlob('pdf', 2, fresh)[0])).toEqual(fresh);
		// the old transfer's tail can no longer complete
		expect(asm.add(oldChunks[1])).toBeNull();
	});

	// a peer controls `total`/`index`, so a bogus value must be rejected before it sizes a buffer
	it('rejects blob chunks with an out-of-range total or index instead of allocating', () => {
		const asm = new BlobAssembler();
		const base = { name: 'pdf', rev: 1, bytes: new Uint8Array([1]) };
		expect(asm.add({ ...base, index: 0, total: 500_000_000 })).toBeNull(); // would allocate ~500M slots
		expect(asm.add({ ...base, index: 0, total: 0 })).toBeNull();
		expect(asm.add({ ...base, index: 0, total: -1 })).toBeNull();
		expect(asm.add({ ...base, index: 5, total: 2 })).toBeNull(); // index past total
		expect(asm.add({ ...base, index: -1, total: 2 })).toBeNull();
		// a legitimate single-chunk blob still assembles
		expect(asm.add({ ...base, index: 0, total: 1 })).toEqual(base.bytes);
	});

	it('parses relay notices and rejects junk', () => {
		expect(parseRelayNotice('{"t":"peers","count":3}')).toEqual({ t: 'peers', count: 3 });
		expect(parseRelayNotice('not json')).toBeNull();
		expect(parseRelayNotice('{"x":1}')).toBeNull();
	});
});
