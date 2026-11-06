import { it, expect, vi, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-live-')));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const main = 'pre\n\\begin{document}\na\nb\nc\nd\n';

let running = 0;
let most = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function fakeEngine() {
	const rel = `_draft/p${Math.random().toString(36).slice(2)}`;
	const abs = path.join(root, rel);
	fs.mkdirSync(abs, { recursive: true });
	return {
		rel,
		abs,
		dead: false,
		ready: Promise.resolve([]),
		teleport: async () => {
			running++;
			most = Math.max(most, running);
			await sleep(30);
			running--;
			return { applyMs: 1, pages: [], code: 0 };
		},
		kill: () => undefined,
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

it('runs one teleport at a time, from the plan on', async () => {
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
	const live = new LiveDraft(root, 'main.tex', '/engine', index, 1, []);
	await Promise.all([
		live.teleport({ file: 'main.tex', text: main.replace('\nc\n', '\nc one\n') }, () => undefined),
		live.teleport({ file: 'other.tex', text: 'x' }, () => undefined),
		live.teleport({ file: 'main.tex', text: main.replace('\nc\n', '\nc two\n') }, () => undefined)
	]);
	expect(most).toBe(1);
});
