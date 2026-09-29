// @vitest-environment jsdom
// The message box and Commit: what stays unstaged after a commit, whose draft a commit clears when
// another folder was opened while it ran, which keys commit, and what the box says HEAD is on.
import { it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import SourceControlPanel from '../../../../src/lib/workspace/scm/ui/SourceControlPanel.svelte';
import { scmDraftFor } from '../../../../src/lib/workspace/scm/actions/scmDraft.svelte';
import { gitBranch, gitHead } from '../../../../src/lib/workspace/scm/gitStore';
import { box } from '../../../../src/lib/runes/box.svelte';
import type { GitStatusEntry } from '../../../../src/lib/workspace/scm/git';

let app: Record<string, unknown> | null = null;
afterEach(() => {
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
	gitBranch.current = null;
	gitHead.current = null;
});

const MAIN: GitStatusEntry = { path: '/p/main.tex', x: ' ', y: 'M' };
const PRIVATE: GitStatusEntry = { path: '/p/private.tex', x: '?', y: '?' };

// the workspace's own reactive values, so a test can change them the way a commit or an Open Folder does
const root = box('/p');
const changes = box<GitStatusEntry[]>([]);
function render(
	onCommit: (message: string, paths: string[]) => Promise<boolean>,
	extra: Record<string, unknown> = {},
	listed = [MAIN, PRIVATE]
) {
	root.current = '/p';
	changes.current = listed;
	app = mount(SourceControlPanel, {
		target: document.body.appendChild(document.createElement('div')),
		props: {
			get root() {
				return root.current;
			},
			get changes() {
				return changes.current;
			},
			isRepo: true,
			branch: 'main',
			history: [],
			onInit: () => {},
			onDiscard: () => {},
			onCommit,
			onRestore: () => {},
			onCompare: () => {},
			onLoadChanges: async () => [],
			historyFraction: 0.4,
			onStartHistoryResize: () => {},
			onResizeHistoryByKey: () => {},
			onOpenDiff: () => {},
			onRefresh: () => {},
			onPublish: () => {},
			onSync: () => {},
			onIgnoreArtifacts: null,
			...extra
		}
	});
	flushSync();
}

const commitButton = () => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Commit')!;
const settle = async () => {
	await tick();
	await Promise.resolve();
	flushSync();
};

it('keeps an unstaged file unstaged after a commit, and forgets ticked build output that went in', async () => {
	const draft = scmDraftFor('/p');
	draft.excluded = ['/p/private.tex'];
	draft.artifactsOptedIn = ['/p/main.pdf'];
	draft.message = 'Tighten the proof';
	const onCommit = vi.fn(async (_message: string, _paths: string[]) => {
		changes.current = [PRIVATE]; // the status after the commit: only what was left out
		return true;
	});
	render(onCommit, {}, [MAIN, PRIVATE, { path: '/p/main.pdf', x: '?', y: '?' }]);
	commitButton().click();
	await settle();
	expect(onCommit).toHaveBeenCalledWith('Tighten the proof', ['/p/main.tex', '/p/main.pdf']);
	expect(draft.message).toBe('');
	// a private draft stays on this computer through the next commit too
	expect(draft.excluded).toEqual(['/p/private.tex']);
	expect(draft.artifactsOptedIn).toEqual([]);
});

it('clears the draft of the folder the commit was made in, not the one opened while it ran', async () => {
	scmDraftFor('/p').message = 'Tighten the proof';
	scmDraftFor('/q').message = 'Half a sentence in the other project';
	let finish!: (ok: boolean) => void;
	render(() => new Promise<boolean>((resolve) => (finish = resolve)));
	commitButton().click();
	root.current = '/q';
	changes.current = [{ path: '/q/intro.tex', x: ' ', y: 'M' }];
	flushSync();
	finish(true);
	await settle();
	expect(scmDraftFor('/q').message).toBe('Half a sentence in the other project');
	expect(scmDraftFor('/p').message).toBe('');
});

it('commits on Ctrl+Enter alone, not on Ctrl+Alt+Enter, which is Compile', async () => {
	scmDraftFor('/p').excluded = [];
	scmDraftFor('/p').message = 'Half-written';
	const onCommit = vi.fn(async () => false);
	render(onCommit);
	const message = document.querySelector('textarea')!;
	message.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, altKey: true, bubbles: true }));
	message.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, bubbles: true }));
	await settle();
	expect(onCommit).not.toHaveBeenCalled();
	message.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
	await settle();
	expect(onCommit).toHaveBeenCalledOnce();
});

it('names the commit, not "HEAD", when HEAD is detached', () => {
	scmDraftFor('/p').message = '';
	gitBranch.current = 'HEAD';
	gitHead.current = '1a2b3c4d5e6f7a8b9c0d';
	render(async () => true, { detached: true, branch: 'HEAD' });
	const placeholder = document.querySelector('textarea')!.placeholder;
	expect(placeholder).toContain('"1a2b3c4"');
	expect(placeholder).not.toContain('HEAD');
});
