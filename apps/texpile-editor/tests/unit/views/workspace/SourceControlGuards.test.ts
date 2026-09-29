// @vitest-environment jsdom
// The panel's guarded states. During a merge: Complete Merge stays disabled while any file still
// holds a marked place, the file row opens that file rather than a comparison, and the ordinary
// commit box is not offered, since the merge is committed by Complete Merge. Inside a
// larger repository: nothing of it is used until the author says so.
import { it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SourceControlPanel from '../../../../src/lib/workspace/scm/ui/SourceControlPanel.svelte';
import type { GitStatusEntry } from '../../../../src/lib/workspace/scm/git';

let app: Record<string, unknown> | null = null;
afterEach(() => {
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
});

function render(changes: GitStatusEntry[], extra: Record<string, unknown> = {}) {
	const calls = { finish: vi.fn(), cancel: vi.fn(), openConflict: vi.fn(), openDiff: vi.fn() };
	app = mount(SourceControlPanel, {
		target: document.body.appendChild(document.createElement('div')),
		props: {
			root: '/p',
			isRepo: true,
			branch: 'main',
			operation: 'merge',
			changes,
			history: [],
			onInit: () => {},
			onDiscard: () => {},
			onCommit: async () => true,
			onRestore: () => {},
			onCompare: () => {},
			onLoadChanges: async () => [],
			historyFraction: 0.4,
			onStartHistoryResize: () => {},
			onResizeHistoryByKey: () => {},
			onOpenDiff: calls.openDiff,
			onRefresh: () => {},
			onPublish: () => {},
			onSync: () => {},
			onIgnoreArtifacts: null,
			onOpenConflict: calls.openConflict,
			onFinishCombine: calls.finish,
			onCancelCombine: calls.cancel,
			...extra
		}
	});
	flushSync();
	return calls;
}

const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);

it('will not finish while a file still holds a marked place', () => {
	render([{ path: '/p/main.tex', x: 'U', y: 'U', markers: true }]);
	expect(button('Complete Merge')?.disabled).toBe(true);
	expect(button('Abort Merge')?.disabled).toBe(false);
	expect(document.body.textContent).not.toContain('Ready');
	expect(document.querySelector('textarea')).toBeNull();
});

it('finishes once every place is chosen, and says the file is ready', () => {
	const calls = render([
		{ path: '/p/main.tex', x: 'U', y: 'U', markers: false },
		{ path: '/p/notes.tex', x: 'M', y: ' ' }
	]);
	expect(document.body.textContent).toContain('All conflicts handled, the merge can be completed now.');
	expect(document.body.textContent).toContain('Resolved');
	button('Complete Merge')!.click();
	expect(calls.finish).toHaveBeenCalledOnce();
});

it('opens a file both sides changed at its marked place, not as a comparison', () => {
	const calls = render([{ path: '/p/main.tex', x: 'U', y: 'U', markers: true }]);
	const row = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('main.tex'))!;
	row.click();
	expect(calls.openConflict).toHaveBeenCalledWith('/p/main.tex');
	expect(calls.openDiff).not.toHaveBeenCalled();
});

it('leaves a rebase to the terminal it was started in', () => {
	render([{ path: '/p/main.tex', x: 'U', y: 'U', markers: true }], { operation: 'rebase' });
	expect(button('Complete Merge')).toBeUndefined();
	expect(document.body.textContent).toContain('git rebase --continue');
});

it('asks before using a repository that starts above the folder', () => {
	const onUse = vi.fn();
	const onInit = vi.fn();
	render([{ path: '/p/main.tex', x: 'M', y: ' ' }], {
		operation: null,
		root: '/home/ada/papers/thesis',
		parentRepo: '/home/ada',
		onUseParentRepo: onUse,
		onInit
	});
	// neither its changes nor anything that would save or send them
	expect(document.body.textContent).not.toContain('main.tex');
	expect(document.querySelector('textarea')).toBeNull();
	expect(document.body.textContent).toContain('/home/ada');
	button('Open Repository')!.click();
	expect(onUse).toHaveBeenCalledOnce();
	[...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Initialize Repository'))!.click();
	expect(onInit).toHaveBeenCalledOnce();
});

it('offers Sync as the next step when there is nothing to save but versions to exchange', () => {
	const calls = { sync: vi.fn(), publish: vi.fn() };
	render([], { operation: null, tracking: 'origin/main', ahead: 2, behind: 1, onSync: calls.sync, onPublish: calls.publish });
	const sync = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Sync Changes'))!;
	expect(sync.textContent).toContain('1');
	expect(sync.textContent).toContain('2');
	sync.click();
	expect(calls.sync).toHaveBeenCalledOnce();
});

it('offers Publish as the next step for a branch with nowhere to go yet', () => {
	const publish = vi.fn();
	render([], { operation: null, tracking: null, hasCommits: true, onPublish: publish });
	[...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Publish Branch'))!.click();
	expect(publish).toHaveBeenCalledOnce();
});
