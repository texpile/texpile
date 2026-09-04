// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAnchor } from '$lib/comments/anchor';
import { openEvent, parseLog, serializeLog } from '$lib/comments/log';

let disk: Record<string, string> = {};

vi.mock('$lib/workspace/fileSystem', () => ({
	readTextFile: async (path: string) => {
		const hit = Object.entries(disk).find(([k]) => path.replace(/\\/g, '/').endsWith(k));
		if (!hit) throw new Error(`ENOENT ${path}`);
		return hit[1];
	},
	writeTextFile: async (path: string, text: string) => {
		const key = Object.keys(disk).find((k) => path.replace(/\\/g, '/').endsWith(k)) ?? '.texpile/comments.jsonl';
		disk[key] = text;
	},
	joinPath: (a: string, b: string) => `${a}/${b}`
}));
vi.mock('$lib/workspace/texpileDir', () => ({
	texpilePath: (root: string, name: string) => `${root}/.texpile/${name}`,
	ensureTexpileIgnore: async () => {}
}));
vi.mock('$lib/comments/author', () => ({ resolveAuthor: async () => 'test', forgetAuthor: () => {} }));

const { CommentsController } = await import('$lib/workspace/commentsController.svelte');

const ROOT = '/w';
const INTRO = 'The introduction says something worth arguing with.\n';
const REWRITTEN = 'The introduction now says something worth defending.\n';

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('re-pinning a thread after an outside rewrite', () => {
	beforeEach(() => {
		const at = INTRO.indexOf('worth arguing with');
		disk = {
			'.texpile/comments.jsonl': serializeLog([
				openEvent({
					id: 'a',
					file: 'main.tex',
					anchor: buildAnchor(INTRO, at, at + 18),
					body: 'note',
					by: 'test',
					at: '2026-01-01T00:00:00Z'
				})
			])
		};
	});

	it('moves the highlight, clears the orphan badge, and signs the event as the caller', async () => {
		const ctl = new CommentsController({ root: () => ROOT, preferredAuthor: () => 'test', openFileAt: () => {} });
		await ctl.load(ROOT);
		ctl.reanchor(`${ROOT}/main.tex`, REWRITTEN);
		await settle();
		expect(ctl.orphaned.has('a')).toBe(true);

		const at = REWRITTEN.indexOf('worth defending');
		await ctl.moveAnchor(ctl.threads[0], buildAnchor(REWRITTEN, at, at + 15), 'main.tex', 'Claude Code');
		expect(ctl.orphaned.has('a')).toBe(false);
		expect(ctl.ranges).toEqual([{ id: 'a', from: at, to: at + 15, resolved: false }]);

		const events = parseLog(disk['.texpile/comments.jsonl']);
		const last = events[events.length - 1];
		expect(last.t).toBe('anchor');
		expect(last.by).toBe('Claude Code');
		expect(ctl.threads[0].anchor.quote).toBe('worth defending');
	});
});
