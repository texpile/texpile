import { it, expect, vi } from 'vitest';

vi.mock('../../../../../../../electron/src/draft/teleport/enginePool', () => ({ stopPool: () => undefined }));
vi.mock('../../../../../../../electron/src/draft/teleport/liveDraft', () => ({
	LiveDraft: class {
		constructor(
			readonly root: string,
			readonly mainRel: string
		) {}
		close(): void {}
		teleport() {
			return Promise.resolve({ ok: true, ms: 0, count: 1, srcFiles: [] });
		}
	}
}));

const { adoptIndex, teleport, stopTeleports } = await import('../../../../../../../electron/src/draft/teleport/teleportService');

// each window's live preview runs its own folder
it('keeps a folder live while another folder compiles', async () => {
	const live = (root: string) => ({ root, mainRel: 'main.tex', engineDir: '/e', index: {} as never, count: 1, srcFiles: [] });
	adoptIndex(live('/work/a'));
	adoptIndex(live('/work/b'));
	const r = await teleport({ root: '/work/a', mainFile: 'main.tex', file: 'main.tex', text: 'x' }, () => undefined);
	expect(r.ok).toBe(true);
	stopTeleports();
});
