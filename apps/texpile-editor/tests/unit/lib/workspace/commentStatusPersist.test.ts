// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAnchor } from '$lib/comments/anchor';
import { openEvent, parseLog, serializeLog } from '$lib/comments/log';

let disk: Record<string, string> = {};
/** every write the controller made, so a write STORM is visible rather than merely slow */
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
const INTRO = 'The introduction says something worth arguing with.\n';

function log(threads: { id: string; file: string }[]): string {
	const at = INTRO.indexOf('worth arguing with');
	return serializeLog(
		threads.map((t) => openEvent({ ...t, anchor: buildAnchor(INTRO, at, at + 18), body: 'note', by: 'test', at: '2026-01-01T00:00:00Z' }))
	);
}

const make = () => new CommentsController({ root: () => ROOT, preferredAuthor: () => 'test', openFileAt: () => {} });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('persisted placement status', () => {
	beforeEach(() => {
		writes = 0;
		disk = {};
	});

	it('records what it measured on the open file', async () => {
		disk['.texpile/comments.jsonl'] = log([{ id: 'gone', file: 'main.tex' }]);
		const ctl = make();
		await ctl.load(ROOT);
		ctl.reanchor(`${ROOT}/main.tex`, 'The introduction was rewritten entirely.\n');
		await settle();
		const folded = parseLog(disk['.texpile/comments.jsonl']);
		expect(folded.some((e) => e.t === 'place' && e.thread === 'gone' && e.detached === true)).toBe(true);
	});

	/**
	 * The hazard that makes this feature dangerous rather than merely wrong: appending reassigns
	 * store.threads, resolve() reads store.threads, so a write that is not delta-gated re-enters
	 * resolve() and writes again - forever, freezing the window.
	 */
	it('writes once and then goes quiet, however many times it re-resolves', async () => {
		disk['.texpile/comments.jsonl'] = log([{ id: 'gone', file: 'main.tex' }]);
		const ctl = make();
		await ctl.load(ROOT);
		const changed = 'The introduction was rewritten entirely.\n';
		ctl.reanchor(`${ROOT}/main.tex`, changed);
		await settle();
		const afterFirst = writes;
		expect(afterFirst).toBeGreaterThan(0);
		// every later pass measures the same thing, so it has nothing new to say
		for (let i = 0; i < 5; i++) {
			ctl.reanchor(`${ROOT}/main.tex`, changed);
			await settle();
		}
		expect(writes).toBe(afterFirst);
	});

	// a disk reload and a log refresh from one watcher event both measure before either commit lands
	it('two passes in the same tick write the verdict once', async () => {
		disk['.texpile/comments.jsonl'] = log([{ id: 'gone', file: 'main.tex' }]);
		const ctl = make();
		await ctl.load(ROOT);
		const changed = 'The introduction was rewritten entirely.\n';
		ctl.reanchor(`${ROOT}/main.tex`, changed);
		ctl.reanchor(`${ROOT}/main.tex`, changed);
		await settle();
		await settle();
		const places = parseLog(disk['.texpile/comments.jsonl']).filter((e) => e.t === 'place');
		expect(places).toHaveLength(1);
	});

	/**
	 * The panel only asks `if (t.detached)`, so "nobody looked" and "looked, nothing wrong" draw the
	 * identical row - and recording the second would put one line per thread into a committed file the
	 * first time anyone opened each file, all of them saying nothing is wrong. Browsing a project has
	 * to be free, so a thread that places writes NOTHING.
	 */
	it('writes nothing at all for a thread that places', async () => {
		disk['.texpile/comments.jsonl'] = log([{ id: 'fine', file: 'main.tex' }]);
		const before = disk['.texpile/comments.jsonl'];
		const ctl = make();
		await ctl.load(ROOT);
		ctl.reanchor(`${ROOT}/main.tex`, INTRO);
		await settle();
		expect(writes).toBe(0);
		expect(disk['.texpile/comments.jsonl']).toBe(before);
	});

	/** opening every file of a project nobody has commented into must not touch the log once */
	it('stays silent across a whole folder of files that all place', async () => {
		disk['.texpile/comments.jsonl'] = log(Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, file: `ch${i % 5}.tex` })));
		const ctl = make();
		await ctl.load(ROOT);
		for (let f = 0; f < 5; f++) {
			ctl.reanchor(`${ROOT}/ch${f}.tex`, INTRO);
			await settle();
		}
		expect(writes).toBe(0);
	});

	it('badges a remembered thread in a file that is not open', async () => {
		disk['.texpile/comments.jsonl'] =
			log([{ id: 'gone', file: 'main.tex' }]) +
			serializeLog([{ v: 1, t: 'place', thread: 'gone', detached: true, by: 'test', at: '2026-01-02T00:00:00Z' }]);
		const ctl = make();
		await ctl.load(ROOT);
		ctl.reanchor(`${ROOT}/basics.tex`, 'Unrelated prose.\n');
		await settle();
		expect([...ctl.orphaned]).toEqual(['gone']);
	});

	/**
	 * "Not in this view" is a claim about the view the reader is in. Source mode draws every thread it
	 * can resolve, so the badge - and its "switch to source mode to see it" note - is false there, for
	 * a remembered file just as much as for the open one.
	 */
	describe('the hidden badge follows the current view', () => {
		const withHidden = () =>
			log([{ id: 'h', file: 'main.tex' }]) +
			serializeLog([{ v: 1, t: 'place', thread: 'h', hidden: true, by: 'test', at: '2026-01-02T00:00:00Z' }]);

		it('shows a remembered hidden thread in visual mode', async () => {
			disk['.texpile/comments.jsonl'] = withHidden();
			const ctl = make();
			await ctl.load(ROOT);
			ctl.setVisualMode(true);
			ctl.reanchor(`${ROOT}/basics.tex`, 'Unrelated prose.\n');
			await settle();
			expect([...ctl.notVisible]).toEqual(['h']);
		});

		it('says nothing in source mode, so the panel never tells you to switch to source', async () => {
			disk['.texpile/comments.jsonl'] = withHidden();
			const ctl = make();
			await ctl.load(ROOT);
			ctl.setVisualMode(false);
			ctl.reanchor(`${ROOT}/basics.tex`, 'Unrelated prose.\n');
			await settle();
			expect([...ctl.notVisible]).toEqual([]);
		});

		it('drops the open file own report when the reader leaves visual', async () => {
			disk['.texpile/comments.jsonl'] = log([{ id: 'h', file: 'main.tex' }]);
			const ctl = make();
			await ctl.load(ROOT);
			ctl.setVisualMode(true);
			ctl.reanchor(`${ROOT}/main.tex`, INTRO);
			await ctl.recordHidden('main.tex', new Set(['h']));
			expect([...ctl.notVisible]).toEqual(['h']);
			ctl.setVisualMode(false);
			expect([...ctl.notVisible]).toEqual([]);
		});
	});

	it('lets the live answer overrule a stale recording for the open file', async () => {
		disk['.texpile/comments.jsonl'] =
			log([{ id: 'gone', file: 'main.tex' }]) +
			serializeLog([{ v: 1, t: 'place', thread: 'gone', detached: true, by: 'test', at: '2026-01-02T00:00:00Z' }]);
		const ctl = make();
		await ctl.load(ROOT);
		// the text is back, so the recording is wrong and the file in front of us wins
		ctl.reanchor(`${ROOT}/main.tex`, INTRO);
		await settle();
		expect([...ctl.orphaned]).toEqual([]);
		const folded = parseLog(disk['.texpile/comments.jsonl']);
		expect(folded.filter((e) => e.t === 'place' && e.detached === false)).toHaveLength(1);
	});
});
