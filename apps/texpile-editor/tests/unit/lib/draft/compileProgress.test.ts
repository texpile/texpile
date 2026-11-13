import { beforeEach, describe, expect, it, vi } from 'vitest';

type Told = { root: string; step?: 'engine' | 'typeset' | 'bibliography'; pass?: number; notes?: string[] };
const native = vi.hoisted(() => ({
	tell: (_at: Told): void => {},
	onDraftProgress(cb: (at: Told) => void): () => void {
		native.tell = cb;
		return () => {};
	}
}));
vi.mock('$lib/workspace/fileSystem', () => ({ nativeBridge: () => native }));

import { CompileProgress } from '$lib/draft/compileProgress.svelte';

let progress: CompileProgress;
const steps = (): string[] => progress.started.map((at) => `${at.step} ${at.file ?? at.pass}`);

beforeEach(() => {
	progress = new CompileProgress(() => '/paper');
	progress.begin();
});

describe('CompileProgress', () => {
	it('lists the steps as they start, the passes after the first as one line', () => {
		native.tell({ root: '/paper', step: 'engine', pass: 1 });
		native.tell({ root: '/paper', step: 'typeset', pass: 1 });
		native.tell({ root: '/other', step: 'bibliography', pass: 1 });
		native.tell({ root: '/paper', step: 'bibliography', pass: 1 });
		native.tell({ root: '/paper', step: 'engine', pass: 2 });
		native.tell({ root: '/paper', step: 'typeset', pass: 2 });
		native.tell({ root: '/paper', step: 'engine', pass: 3 });
		expect(steps()).toEqual(['engine 1', 'typeset 1', 'bibliography 1', 'typeset 2']);
	});

	it('starts over from the engine after a package is installed', () => {
		native.tell({ root: '/paper', step: 'typeset', pass: 1 });
		progress.installing('siunitx.sty');
		native.tell({ root: '/paper', notes: ['tlmgr: package repository'] });
		native.tell({ root: '/paper', step: 'engine', pass: 1 });
		expect(steps()).toEqual(['engine 1', 'typeset 1', 'install siunitx.sty', 'engine 1']);
		expect(progress.notes).toEqual(['tlmgr: package repository']);
	});
});
