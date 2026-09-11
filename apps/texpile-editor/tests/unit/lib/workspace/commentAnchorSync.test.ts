// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAnchor, type CommentAnchor } from '$lib/comments/anchor';
import { openEvent, parseLog, serializeLog } from '$lib/comments/log';

let disk: Record<string, string> = {};
let writes = 0;

vi.mock('$lib/workspace/fileSystem', () => ({
	readTextFile: async (path: string) => {
		const hit = Object.entries(disk).find(([k]) => path.replace(/\\/g, '/').endsWith(k));
		if (!hit) throw new Error(`ENOENT ${path}`);
		return hit[1];
	},
	writeTextFile: async (path: string, text: string) => {
		writes++;
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
const FILE = `${ROOT}/main.tex`;
const QUOTE = 'worth arguing with';
const ORIGINAL = 'The introduction says something worth arguing with.\n';
const EDITED = 'A rewritten opening that is really worth arguing with.\n';

function logWith(anchor: CommentAnchor): string {
	return serializeLog([openEvent({ id: 't1', file: 'main.tex', anchor, body: 'note', by: 'test', at: '2026-01-01T00:00:00Z' })]);
}

function liveFrom(text: string): Map<string, CommentAnchor> {
	const at = text.indexOf(QUOTE);
	return new Map([['t1', buildAnchor(text, at, at + QUOTE.length)]]);
}

function make(live: (text: string) => Map<string, CommentAnchor> | null) {
	return new CommentsController({ root: () => ROOT, preferredAuthor: () => 'test', openFileAt: () => {}, liveAnchors: live });
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('anchors follow edits made in Texpile', () => {
	beforeEach(() => {
		writes = 0;
		const at = ORIGINAL.indexOf(QUOTE);
		disk = { '.texpile/comments.jsonl': logWith(buildAnchor(ORIGINAL, at, at + QUOTE.length)) };
	});

	it('rewrites the anchor before the save, so the re-anchor after it is exact', async () => {
		let editorUp = false;
		const ctl = make((text) => (editorUp ? liveFrom(text) : null));
		await ctl.load(ROOT);
		ctl.reanchor(FILE, EDITED);
		await settle();
		expect(ctl.weak.has('t1')).toBe(true);

		editorUp = true;
		await ctl.syncAnchorsToText(FILE, EDITED);
		const events = parseLog(disk['.texpile/comments.jsonl']);
		const moved = events.find((e) => e.t === 'anchor' && e.thread === 't1');
		expect(moved).toBeTruthy();
		expect(moved && moved.t === 'anchor' && moved.anchor.quote).toBe(QUOTE);
		expect(ctl.weak.has('t1')).toBe(false);

		editorUp = false;
		ctl.reanchor(FILE, EDITED);
		await settle();
		expect(ctl.weak.has('t1')).toBe(false);
		expect(ctl.orphaned.has('t1')).toBe(false);
		const at = EDITED.indexOf(QUOTE);
		expect(ctl.ranges.find((r) => r.id === 't1')).toMatchObject({ from: at, to: at + QUOTE.length });
	});

	it("keeps the editor's exact range through a refresh mid-edit, and records nothing", async () => {
		const ctl = make(liveFrom);
		await ctl.load(ROOT);
		const before = writes;
		ctl.reanchor(FILE, EDITED);
		await settle();
		const at = EDITED.indexOf(QUOTE);
		expect(ctl.ranges.find((r) => r.id === 't1')).toMatchObject({ from: at, to: at + QUOTE.length });
		expect(ctl.weak.has('t1')).toBe(false);
		expect(ctl.orphaned.has('t1')).toBe(false);
		expect(writes).toBe(before);
	});

	it('carries the exact ranges across a view switch, when no editor is up to ask', async () => {
		let editorUp = true;
		const ctl = make((text) => (editorUp ? liveFrom(text) : null));
		await ctl.load(ROOT);
		ctl.reanchor(FILE, EDITED);
		await settle();
		ctl.carryLive();
		editorUp = false;
		const before = writes;
		ctl.reanchor(FILE, EDITED);
		await settle();
		const at = EDITED.indexOf(QUOTE);
		expect(ctl.ranges.find((r) => r.id === 't1')).toMatchObject({ from: at, to: at + QUOTE.length });
		expect(ctl.weak.has('t1')).toBe(false);
		expect(writes).toBe(before);
		ctl.reanchor(FILE, EDITED);
		await settle();
		expect(ctl.weak.has('t1')).toBe(false);
		const handed = ctl.withKnownAnchors(ctl.threads);
		expect(handed[0].anchor.start).toBe(at);
	});

	it('writes nothing when the old anchor still finds the same place', async () => {
		const ctl = make(liveFrom);
		await ctl.load(ROOT);
		ctl.reanchor(FILE, ORIGINAL);
		await settle();
		const before = writes;
		await ctl.syncAnchorsToText(FILE, ORIGINAL);
		expect(writes).toBe(before);
		expect(parseLog(disk['.texpile/comments.jsonl']).some((e) => e.t === 'anchor')).toBe(false);
	});

	it('leaves a file the editor is not showing alone', async () => {
		const ctl = make(() => null);
		await ctl.load(ROOT);
		ctl.reanchor(FILE, EDITED);
		await settle();
		const before = writes;
		await ctl.syncAnchorsToText(FILE, EDITED);
		expect(writes).toBe(before);
	});
});
