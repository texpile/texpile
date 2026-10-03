// @vitest-environment jsdom
// Revealing a thread from the panel: one on another file is selected once that file is up. And a suggestion's own
// message, which only Accept or Reject takes away
import { it, expect, vi, beforeEach } from 'vitest';
import { buildAnchor } from '$lib/comments/anchor';
import { openEvent, serializeLog } from '$lib/comments/log';
import { activeSuggestions } from '$lib/comments/activeSuggestions.svelte';

let disk: Record<string, string> = {};

vi.mock('$lib/workspace/fileSystem', () => ({
	readTextFile: async (path: string) => {
		const hit = Object.entries(disk).find(([k]) => path.replace(/\\/g, '/').endsWith(k));
		if (!hit) throw new Error(`ENOENT ${path}`);
		return hit[1];
	},
	writeTextFile: async (path: string, text: string) => {
		disk['.texpile/comments.jsonl'] = text;
	}
}));
vi.mock('$lib/workspace/texpileDir', () => ({
	texpilePath: (root: string, name: string) => `${root}/.texpile/${name}`,
	ensureTexpileIgnore: async () => {}
}));
vi.mock('$lib/comments/author', () => ({ resolveAuthor: async () => 'test', forgetAuthor: () => {} }));

const { CommentsController } = await import('$lib/workspace/commentsController.svelte');

const ROOT = '/w';
const MAIN = 'We prove the estimator is sharp for smooth solutions.\n';
const APPENDIX = 'The appendix holds the longer proof of the bound.\n';

function threadOn(id: string, file: string, text: string, words: string, restore?: string) {
	const at = text.indexOf(words);
	return openEvent({ id, file, anchor: buildAnchor(text, at, at + words.length), body: id, by: 'test', at: 'now', restore });
}

let opened: string[] = [];
beforeEach(() => {
	opened = [];
	disk = {
		'.texpile/comments.jsonl': serializeLog([
			threadOn('here', 'main.tex', MAIN, 'sharp'),
			threadOn('appendix', 'appendix.tex', APPENDIX, 'longer proof'),
			threadOn('gone', 'deleted.tex', 'Words of a file deleted since.', 'deleted'),
			threadOn('suggested', 'main.tex', MAIN, 'smooth', 'regular')
		])
	};
});

async function openMain() {
	const ctl = new CommentsController({ root: () => ROOT, preferredAuthor: () => 'test', openFileAt: (abs) => opened.push(abs) });
	await ctl.load(ROOT);
	ctl.reanchor(`${ROOT}/main.tex`, MAIN);
	return { ctl, thread: (id: string) => ctl.threads.find((t) => t.id === id)! };
}

it('selects a thread on another file once that file opens', async () => {
	const { ctl, thread } = await openMain();
	ctl.open(thread('appendix'));
	expect(opened).toEqual([`${ROOT}/appendix.tex`]);
	ctl.selected = null;
	ctl.reanchor(`${ROOT}/appendix.tex`, APPENDIX);
	expect(ctl.selected).toBe('appendix');
});

// the panel offers threads whose file is gone; their file never opens, and they took the selection back at each refresh
it('leaves the selection alone after a thread whose file never opened', async () => {
	const { ctl, thread } = await openMain();
	ctl.open(thread('gone'));
	ctl.open(thread('here'));
	await ctl.refresh();
	expect(ctl.selected).toBe('here');
});

// the thread and its drawing went with that message while its words stayed: an accept the log never recorded
it('keeps a suggestion and the log as they were when asked to delete its own message', async () => {
	const { ctl, thread } = await openMain();
	const log = disk['.texpile/comments.jsonl'];
	await ctl.removeMessage(thread('suggested'), thread('suggested').messages[0]);
	expect(disk['.texpile/comments.jsonl']).toBe(log);
	expect(thread('suggested').messages.map((msg) => msg.id)).toEqual(['suggested']);
	expect(activeSuggestions.current.map((s) => s.id)).toEqual(['suggested']);
});

it('deletes a reply on a suggestion', async () => {
	const { ctl, thread } = await openMain();
	const reply = await ctl.reply(thread('suggested'), 'why', 'bo');
	await ctl.removeMessage(thread('suggested'), thread('suggested').messages[1]);
	expect(thread('suggested').messages.map((msg) => msg.id)).toEqual(['suggested']);
	expect(disk['.texpile/comments.jsonl']).toContain(`"message":"${reply}"`);
});
