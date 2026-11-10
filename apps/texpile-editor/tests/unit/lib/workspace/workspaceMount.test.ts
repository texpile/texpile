// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { attachCloseGuard, attachWindowListeners, type WindowWiringDeps } from '$lib/workspace/workspaceMount';
import { fileService } from '$lib/files/service/fileService';
import { fileUriOf } from '$lib/files/identity/fileUris';
import type { FileChange } from '$lib/files/changes/fileChanges';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';

let off: (() => void)[] = [];
afterEach(() => {
	for (const f of off) f();
	off = [];
});

it("hands a file changed in place on the host's disk to the session", async () => {
	let fire: (changes: FileChange[]) => void = () => {};
	const provider = { watch: (onChange: (c: FileChange[]) => void) => ((fire = onChange), () => {}) } as unknown as WorkspaceProvider;
	off.push(fileService.use(provider));
	const shared: string[][] = [];
	const noop = () => {};
	const deps: WindowWiringDeps = {
		refreshTree: noop,
		refreshScm: noop,
		reloadReferences: noop,
		isHost: () => true,
		syncBuffers: noop,
		runCompile: noop,
		onWindowResize: noop,
		reloadProjectState: noop,
		loadExternalPdf: noop,
		nudgeTypst: noop,
		shareUpdatedFiles: (paths) => shared.push(paths)
	};
	off.push(attachWindowListeners(deps));

	fire([{ type: 'updated', resource: fileUriOf('/fx/images/dot.png') }]);
	await new Promise((r) => setTimeout(r, 0));
	expect(shared.map((paths) => paths.map((p) => p.replace(/\\/g, '/')))).toEqual([['/fx/images/dot.png']]);
});

function stubCloseBridge(): { fire: () => Promise<void>; decisions: boolean[] } {
	const decisions: boolean[] = [];
	let hold: () => void | Promise<void> = () => {};
	(window as unknown as { texpileNative: unknown }).texpileNative = {
		onBeforeClose: (cb: () => void) => ((hold = cb), () => {}),
		closeDecision: (proceed: boolean) => decisions.push(proceed)
	};
	return { fire: async () => void (await hold()), decisions };
}

it('ends the shared session before the window close goes ahead', async () => {
	const bridge = stubCloseBridge();
	const calls: string[] = [];
	off.push(
		attachCloseGuard({
			flushSaves: async () => void calls.push('flush'),
			hasStranded: () => false,
			confirmLeaveUnsaved: async () => true,
			endSession: async () => void calls.push('end')
		}) ?? (() => {})
	);
	await bridge.fire();
	expect(calls).toEqual(['flush', 'end']);
	expect(bridge.decisions).toEqual([true]);
});

it('keeps the session while stranded edits are still being asked about', async () => {
	const bridge = stubCloseBridge();
	const calls: string[] = [];
	off.push(
		attachCloseGuard({
			flushSaves: async () => void calls.push('flush'),
			hasStranded: () => true,
			confirmLeaveUnsaved: async () => false,
			endSession: async () => void calls.push('end')
		}) ?? (() => {})
	);
	await bridge.fire();
	expect(calls).toEqual(['flush']);
	expect(bridge.decisions).toEqual([false]);
});
