// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fileService } from '$lib/files/service/fileService';
import { recordFileStamp } from '$lib/files/service/fileStamp';
import { fileUriOf } from '$lib/files/identity/fileUris';
import { attachWindowListeners } from '$lib/workspace/workspaceMount';
import type { FileChange } from '$lib/files/changes/fileChanges';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';

const mtimes = new Map<string, number>();
let fire: (changes: FileChange[]) => void = () => {};
fileService.use({
	stat: async (p: string) => ({ exists: mtimes.has(p), mtimeMs: mtimes.get(p) ?? 0, size: 10 }),
	watch: (onChange: (changes: FileChange[]) => void) => {
		fire = onChange;
		return () => {};
	}
} as unknown as WorkspaceProvider);

function listen() {
	const deps = {
		refreshTree: vi.fn(),
		refreshScm: vi.fn(),
		reloadReferences: vi.fn(),
		isHost: () => true,
		syncBuffers: vi.fn(),
		runCompile: vi.fn(),
		onWindowResize: vi.fn(),
		reloadProjectState: vi.fn(),
		loadExternalPdf: vi.fn()
	};
	const detach = attachWindowListeners(deps);
	return { deps, detach };
}

describe('the watcher', () => {
	it("leaves everything alone for this window's own save, and the tree for any edit", async () => {
		mtimes.set('/w/main.tex', 1);
		await recordFileStamp('/w/main.tex');
		const { deps, detach } = listen();
		fire([{ type: 'updated', resource: fileUriOf('/w/main.tex') }]);
		await new Promise((r) => setTimeout(r, 10));
		expect(deps.reloadReferences).not.toHaveBeenCalled();

		mtimes.set('/w/main.tex', 2);
		fire([{ type: 'updated', resource: fileUriOf('/w/main.tex') }]);
		await vi.waitFor(() => expect(deps.reloadReferences).toHaveBeenCalledTimes(1));
		expect(deps.refreshTree).not.toHaveBeenCalled();
		expect(deps.refreshScm).toHaveBeenCalledTimes(1);

		fire([{ type: 'added', resource: fileUriOf('/w/new.tex') }]);
		await vi.waitFor(() => expect(deps.refreshTree).toHaveBeenCalledTimes(1));
		detach();
	});
});
