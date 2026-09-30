// @vitest-environment jsdom
// A template saved as its Git remote, on the renderer's side: what a clone that did not work turns
// into. The clone itself is git's, tested live in gitCloneLive.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserTemplate } from '$lib/workspace/templates/templateBridge.types';

let cloneResult: { ok: boolean; failure?: string; error?: string } = { ok: true };
vi.mock('$lib/workspace/scm/remote/gitClone', () => ({ gitClone: async () => cloneResult }));

const { createFromRemote, CloneCancelledError } = await import('$lib/workspace/templates/saved/remoteTemplate');
const { m } = await import('$lib/paraglide/messages');

const THESIS: UserTemplate & { remote: string } = {
	id: 'thesis',
	name: 'Thesis',
	description: '',
	lang: 'typst',
	mainFile: 'thesis.typ',
	createdAt: 0,
	remote: 'https://example.org/lab/thesis.git'
};

let bridge: { stage: ReturnType<typeof vi.fn>; adopt: ReturnType<typeof vi.fn>; discard: ReturnType<typeof vi.fn> };

beforeEach(() => {
	bridge = { stage: vi.fn(async () => '/data/templates/.staging/1'), adopt: vi.fn(async () => {}), discard: vi.fn(async () => {}) };
	vi.stubGlobal('texpileTemplates', bridge);
});

describe('a remote template whose clone does not work', () => {
	it('stops quietly when the author closes the sign-in, copying nothing and leaving no staging folder', async () => {
		cloneResult = { ok: false, failure: 'cancelled' };
		await expect(createFromRemote('/p', THESIS)).rejects.toBeInstanceOf(CloneCancelledError);
		expect(bridge.adopt).not.toHaveBeenCalled();
		expect(bridge.discard).toHaveBeenCalledWith('/data/templates/.staging/1');
	});

	it('says a refused sign-in was refused', async () => {
		cloneResult = { ok: false, failure: 'auth', error: 'fatal: Authentication failed' };
		const failed = createFromRemote('/p', THESIS);
		await expect(failed).rejects.toThrow(m.vcs_clone_auth());
		await expect(failed).rejects.not.toBeInstanceOf(CloneCancelledError);
	});
});
