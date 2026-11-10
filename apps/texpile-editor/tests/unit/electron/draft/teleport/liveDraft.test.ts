import { it, expect, vi, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-live-')));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const main = 'pre\n\\begin{document}\na\nb\nc\nd\n';

let running = 0;
let most = 0;
// the next engines taken run until killed
let looping = 0;
// the next runs exit after the apply, as TeX does on a fatal error
const ends = { fatal: false };
// the next runs, each shipping its pages and ending as given
type Run = { pages: number[]; cut?: boolean; stop?: number };
const runs: Run[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function fakeEngine() {
	const rel = `_draft/p${Math.random().toString(36).slice(2)}`;
	const abs = path.join(root, rel);
	fs.mkdirSync(path.join(abs, 'tele'), { recursive: true });
	const loops = looping-- > 0;
	let killed = () => undefined as void;
	return {
		root,
		rel,
		abs,
		dead: false,
		serves: 0,
		nextServe: () => 1,
		takeStagedServe: () => null,
		parked: Promise.resolve(false),
		ready: Promise.resolve([]),
		teleport: async (_plan: string, onPage: (p: object) => void) => {
			if (loops) return new Promise((resolve) => (killed = () => resolve({ applyMs: 1, pages: [], code: null })));
			const run = runs.shift();
			if (run) {
				const pages = run.pages.map((n) => ({ n, records: '', w: 1, h: 1 }));
				pages.forEach(onPage);
				const stop = run.stop === undefined ? {} : { stop: { shipped: run.stop, rec: 'r.lua' } };
				return { applyMs: 1, pages, code: null, cut: run.cut, ...stop };
			}
			running++;
			most = Math.max(most, running);
			await sleep(30);
			running--;
			return { applyMs: 1, pages: [], code: null, ended: !ends.fatal };
		},
		kill: () => killed(),
		remove: () => undefined
	};
}

vi.mock('../../../../../../../electron/src/draft/teleport/enginePool', async (original) => ({
	...(await original<object>()),
	warmPool: () => undefined,
	diskPreamble: () => 'pre\n\\begin{document}',
	// the wait for a spare: the second edit arrived here and ran alongside the first
	takeEngine: async () => {
		await sleep(20);
		return fakeEngine();
	}
}));

const { LiveDraft } = await import('../../../../../../../electron/src/draft/teleport/liveDraft');
const { PointIndex } = await import('../../../../../../../electron/src/draft/teleport/pointIndex');

function liveDraft(srcFiles: string[] = []) {
	fs.mkdirSync(path.join(root, 'snap'), { recursive: true });
	fs.writeFileSync(path.join(root, 'snap', 'main.tex'), main);
	const index = new PointIndex(
		[{ point: { rec: 'r.lua', stack: [['main.tex', 3]], shipped: 0, open: false } }],
		'main.tex',
		2,
		[],
		'',
		root
	);
	index.basis.set('main.tex', path.join(root, 'snap', 'main.tex'));
	return new LiveDraft(root, 'main.tex', '/engine', index, 1, srcFiles);
}

it('runs one teleport at a time, from the plan on', async () => {
	const live = liveDraft();
	await Promise.all([
		live.teleport({ file: 'main.tex', text: main.replace('\nc\n', '\nc one\n') }, () => undefined),
		live.teleport({ file: 'other.tex', text: 'x' }, () => undefined),
		live.teleport({ file: 'main.tex', text: main.replace('\nc\n', '\nc two\n') }, () => undefined)
	]);
	expect(most).toBe(1);
});

// an edit that loops reads no line and ships no page, and every edit after it waits in the queue
it('kills a run that ships no page and serves the next edit', async () => {
	vi.useFakeTimers();
	looping = 1;
	const live = liveDraft();
	const loop = live.teleport({ file: 'main.tex', text: main.replace('\nc\n', '\nc \\loop\n') }, () => undefined);
	const next = live.teleport({ file: 'main.tex', text: main.replace('\nc\n', '\nc fixed\n') }, () => undefined);
	await vi.advanceTimersByTimeAsync(10100);
	expect(await loop).toMatchObject({ ok: false, reason: 'failed' });
	await vi.advanceTimersByTimeAsync(100);
	expect(await next).toMatchObject({ ok: true });
	vi.useRealTimers();
});

// a write that cut the main file before \end{document} ended the job, and the screen took an earlier serve's page count
it('sends a run that ended the job to the compile', async () => {
	ends.fatal = true;
	const live = liveDraft();
	const r = await live.teleport({ file: 'main.tex', text: main.replace('\nd\n', '\n') }, () => undefined);
	ends.fatal = false;
	expect(r).toMatchObject({ ok: false, reason: 'failed' });
});

// a compile that read the file before the edit reached disk would otherwise be the last word
it('answers the running and waiting edits replaced when a compile takes over', async () => {
	looping = 1;
	const live = liveDraft();
	const running = live.teleport({ file: 'main.tex', text: main.replace('\nc\n', '\nc one\n') }, () => undefined);
	const waiting = live.teleport({ file: 'b.tex', text: 'x' }, () => undefined);
	await sleep(40);
	live.close(true);
	expect(await running).toMatchObject({ ok: false, reason: 'replaced' });
	expect(await waiting).toMatchObject({ ok: false, reason: 'replaced' });
});

// edits in other files each run to the end of their own pages: the one on screen came last and must not wait for them
it('runs the newest waiting edit first', async () => {
	const live = liveDraft();
	const order: string[] = [];
	const first = live.teleport({ file: 'main.tex', text: main.replace('\nc\n', '\nc first\n') }, () => undefined);
	const older = live.teleport({ file: 'b.tex', text: 'x' }, () => undefined).then(() => order.push('older'));
	const newer = live.teleport({ file: 'c.tex', text: 'y' }, () => undefined).then(() => order.push('newer'));
	await Promise.all([first, older, newer]);
	expect(order).toEqual(['newer', 'older']);
});

// a cut run's page showed its new paragraph, and the pages after it kept the line numbers from before it (0809.0469)
it('moves the source lines past the pages a cut run shipped, once', async () => {
	const live = liveDraft(['main.tex']);
	const cutText = main.replace('\na\n', '\na\nx\n');
	runs.push({ pages: [2], cut: true }, { pages: [2, 3], stop: 3 });
	const cut = await live.teleport({ file: 'main.tex', text: cutText }, () => undefined);
	expect(cut).toMatchObject({ reason: 'superseded', stop: 2, shifts: [{ sf: 1, after: 3, by: 1 }] });
	const next = await live.teleport({ file: 'main.tex', text: cutText.replace('\nc\n', '\nc c\n') }, () => undefined);
	expect(next).toMatchObject({ ok: true, stop: 3 });
	expect('shifts' in next && next.shifts).toBeFalsy();
});
