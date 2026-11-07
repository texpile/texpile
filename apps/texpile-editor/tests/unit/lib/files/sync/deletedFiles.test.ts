import { describe, expect, it, vi } from 'vitest';

const history = vi.hoisted(() => ({ addLocalHistory: vi.fn(async () => {}) }));
vi.mock('$lib/workspace/localHistory/localHistory.svelte', () => history);

import { closeIfDeleted } from '$lib/files/sync/deletedFiles';

describe('closeIfDeleted', () => {
	it('closes a deleted file after keeping its unsaved text, and leaves one that is still there', async () => {
		const detach = vi.fn();
		await closeIfDeleted('gone.tex', { exists: async () => false, unsavedText: () => 'Soon unsaved', detach });
		expect(history.addLocalHistory).toHaveBeenCalledWith('gone.tex', 'Soon unsaved', 'deleted');
		expect(detach).toHaveBeenCalledWith('gone.tex');

		const kept = vi.fn();
		await closeIfDeleted('there.tex', { exists: async () => true, unsavedText: () => 'x', detach: kept });
		expect(kept).not.toHaveBeenCalled();
	});
});
