// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildAnchor } from '$lib/comments/anchor';
import { foldLog, openEvent } from '$lib/comments/log';

const DISK = 'Intro.\n\nThe model fails on long inputs.\n';
const BUFFER = 'Intro, expanded a little.\n\nThe model fails on long inputs.\n';
const state = { dirty: true };

vi.mock('$lib/workspace/workspaceStore', () => ({
	workspaceRoot: { current: '/w' },
	isDirty: {
		get current() {
			return state.dirty;
		}
	}
}));
vi.mock('$lib/workspace/fileSystem', () => ({
	readTextFile: async () => DISK,
	writeTextFile: async () => {},
	toLf: (s: string) => s.replace(/\r\n/g, '\n'),
	joinPath: (a: string, b: string) => `${a}/${b}`,
	samePath: (a: string, b: string) => a === b,
	statFile: async () => ({ exists: false, mtimeMs: 0, size: 0 })
}));
vi.mock('$lib/workspace/texpileDir', () => ({
	texpilePath: (root: string, name: string) => `${root}/.texpile/${name}`,
	ensureTexpileIgnore: async () => {}
}));
vi.mock('$lib/workspace/mcpWorkspacePath', () => ({
	resolveInWorkspace: (rel: string) => `/w/${rel}`,
	inOpenTree: () => true
}));
vi.mock('$lib/workspace/documentBuffer.svelte', () => ({
	fileKind: (p: string) => (/\.tex$/.test(p) ? 'tex' : /\.pdf$/.test(p) ? 'pdf' : 'text'),
	hasVisualMode: (k: string) => k === 'tex',
	isRawTextKind: (k: string) => k === 'text'
}));

const { commentsPayload, addCommentPayload } = await import('$lib/workspace/mcpComments');

const at = DISK.indexOf('fails on long');
const threads = foldLog([
	openEvent({ id: 't', file: 'main.tex', anchor: buildAnchor(DISK, at, at + 13), body: 'why', by: 'ana', at: '2026-01-01T00:00:00Z' })
]);

function deps(buffer: string) {
	const adopt = vi.fn(async () => {});
	const d = {
		comments: { threads, store: { writable: true } } as never,
		getLoadedPath: () => '/w/main.tex',
		getBuffer: () => buffer,
		adoptDiskChange: adopt
	};
	return { d, adopt };
}

describe('the open file resolves against its buffer', () => {
	it('a dirty buffer is searched as is, flagged unsaved, and never adopts disk', async () => {
		state.dirty = true;
		const { d, adopt } = deps(BUFFER);
		const r = await commentsPayload(d, {});
		if (!r.ok) throw new Error(r.reason);
		expect(adopt).not.toHaveBeenCalled();
		expect(r.threads[0].unsaved).toBe(true);
		expect(r.threads[0].placed?.from).toBe(BUFFER.indexOf('fails on long'));
		expect(r.threads[0].placed?.match).toBe('relocated');
	});

	it('a clean buffer adopts an outside write first', async () => {
		state.dirty = false;
		const { d, adopt } = deps(DISK);
		const r = await commentsPayload(d, {});
		if (!r.ok) throw new Error(r.reason);
		expect(adopt).toHaveBeenCalledTimes(1);
		expect(r.threads[0].placed?.match).toBe('exact');
	});

	it('refuses a comment on a file the editor does not treat as text', async () => {
		const { d } = deps(DISK);
		const r = await addCommentPayload(d, { path: 'out.pdf', quote: '%PDF-1.7', body: 'x' });
		expect(r.ok).toBe(false);
	});
});
