import { it, expect, vi, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-pool-')));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
fs.writeFileSync(path.join(root, 'main.tex'), 'pre\n\\begin{document}\nbody\n');

vi.mock('../../../../../../../electron/src/draft/teleport/draftEngine', () => ({
	DraftEngine: class {
		constructor(readonly root: string) {}
		serves = 0;
		dead = false;
		ready = Promise.resolve([]);
		exited = new Promise(() => undefined);
		parked = Promise.resolve(false);
		stagedWith: string | null = null;
		dropped = false;
		stage(planRel: string): void {
			this.stagedWith = planRel;
		}
		drop(): void {
			this.dropped = true;
			this.parked = Promise.resolve(true);
		}
		kill(): void {}
		remove(): void {}
	}
}));

const { warmPool, takeEngine, takeStaged, stageEngine, giveBack, stopPool } =
	await import('../../../../../../../electron/src/draft/teleport/enginePool');

// a compile on an engine that served ships its pages after the empty ones of its teleports
it('hands a compile only an engine that never served', async () => {
	const c = {
		root,
		mainRel: 'main.tex',
		engineDir: '/e',
		engine: 'lualatex',
		seedDir: '/s',
		preamble: 'pre\n\\begin{document}',
		preStamp: null
	};
	warmPool(c);
	const served = await takeEngine(c);
	served.serves = 1;
	served.parked = Promise.resolve(true);
	giveBack(served);
	expect(await takeEngine(c)).toBe(served);
	giveBack(served);
	expect(await takeEngine(c, true)).not.toBe(served);
	stopPool();
});

// each window's live preview runs its own folder
it('keeps the spares of a folder while another folder warms its own', async () => {
	const other = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-pool-')));
	fs.writeFileSync(path.join(other, 'main.tex'), 'other\n\\begin{document}\nbody\n');
	const a = {
		root,
		mainRel: 'main.tex',
		engineDir: '/e',
		engine: 'lualatex',
		seedDir: '/s',
		preamble: 'pre\n\\begin{document}',
		preStamp: null
	};
	const b = { ...a, root: other, preamble: 'other\n\\begin{document}' };
	warmPool(a);
	const fromA = await takeEngine(a);
	fromA.parked = Promise.resolve(true);
	giveBack(fromA);
	warmPool(b);
	expect(await takeEngine(a)).toBe(fromA);
	stopPool();
	fs.rmSync(other, { recursive: true, force: true });
});

// typing goes on in one paragraph, so the next edit teleports from the chain a spare already applied
it('hands a staged engine to its own chain, and sends it back to the base for any other', async () => {
	const c = {
		root,
		mainRel: 'main.tex',
		engineDir: '/e',
		engine: 'lualatex',
		seedDir: '/s',
		preamble: 'pre\n\\begin{document}',
		preStamp: null
	};
	warmPool(c);
	const running = await takeEngine(c);
	stageEngine(c, 'chain-1', () => ({ planRel: 'plan-1', serve: 1 }));
	expect(takeStaged(c, 'chain-2')).toBeNull();
	const staged = takeStaged(c, 'chain-1');
	expect(staged).not.toBe(running);
	expect(staged?.stagedWith).toBe('plan-1');
	running.parked = Promise.resolve(true);
	giveBack(running);
	stageEngine(c, 'chain-3', () => ({ planRel: 'plan-3', serve: 3 }));
	expect(running.stagedWith).toBe('plan-3');
	expect(await takeEngine(c)).toBe(running);
	expect(running.dropped).toBe(true);
	stopPool();
});
