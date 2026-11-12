import { it, expect, vi, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-pool-')));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
fs.writeFileSync(path.join(root, 'main.tex'), 'pre\n\\begin{document}\nbody\n');

const made: unknown[] = [];

vi.mock('../../../../../../../electron/src/draft/teleport/draftEngine', () => ({
	DraftEngine: class {
		constructor(readonly root: string) {
			made.push(this);
		}
		preloadImages(): void {}
		serves = 0;
		dead = false;
		ready = Promise.resolve([]);
		exited = new Promise(() => undefined);
		parked = Promise.resolve(false);
		stagedWith: string | null = null;
		dropped = false;
		stage(plan: string): void {
			this.stagedWith = plan;
		}
		drop(): void {
			this.dropped = true;
			this.parked = Promise.resolve(true);
		}
		kill(): void {}
		remove(): void {}
	}
}));

const { warmPool, takeEngine, takeStaged, stageEngine, giveBack, stopPool, preambleOfText } =
	await import('../../../../../../../electron/src/draft/teleport/enginePool');

// what the pool did to a mocked engine
function seen(engine: unknown): { stagedWith: string | null; dropped: boolean } {
	return engine as { stagedWith: string | null; dropped: boolean };
}

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
	stageEngine(c, 'chain-1', () => ({ plan: 'plan-1', serve: 1 }));
	expect(await takeStaged(c, 'chain-2')).toBeNull();
	const staged = await takeStaged(c, 'chain-1');
	expect(staged).not.toBe(running);
	expect(seen(staged).stagedWith).toBe('plan-1');
	running.parked = Promise.resolve(true);
	giveBack(running);
	stageEngine(c, 'chain-3', () => ({ plan: 'plan-3', serve: 3 }));
	expect(seen(running).stagedWith).toBe('plan-3');
	expect(await takeEngine(c)).toBe(running);
	expect(seen(running).dropped).toBe(true);
	stopPool();
});

// an engine ends its run with an exit when it cannot park: it served its count, or the run wrote PDF objects
it('passes over a staged engine that exited where it should have parked', async () => {
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
	served.parked = Promise.resolve(false);
	giveBack(served, { key: 'chain-1', rec: 'rec-1' });
	expect(await takeStaged(c, 'chain-1')).toBeNull();
	stopPool();
});

// a spare that read the last compile's images holds objects the next compile would number its own after: the image
// list then changed on every compile, and every waiting engine left
it('gives a compile a fresh engine once the spares read images at the base', async () => {
	const c = {
		root,
		mainRel: 'main.tex',
		engineDir: '/e',
		engine: 'lualatex',
		seedDir: '/s',
		preamble: 'pre\n\\begin{document}',
		preStamp: null
	};
	fs.writeFileSync(path.join(root, 'none.lua'), 'return {}\n');
	fs.writeFileSync(path.join(root, 'images.lua'), 'return {{n=172,file="a.pdf",hash=""}}\n');
	made.length = 0;
	warmPool({ ...c, imageList: 'none.lua' });
	const spares = [...made];
	expect(spares).toContain(await takeEngine(c, true));
	stopPool();
	made.length = 0;
	warmPool({ ...c, imageList: 'images.lua' });
	const withImages = [...made];
	expect(withImages).not.toContain(await takeEngine(c, true));
	stopPool();
});

// 0811.3855 keeps an old %\begin{document} above its \title and \author: an edit there must change the spares' key
it('reads the preamble up to the begin document line that is not commented out', () => {
	const text = '\\documentclass{article}\n%\\begin{document}\n\\author{A}\n\\begin{document}\nbody\n';
	expect(preambleOfText(text)).toBe('\\documentclass{article}\n%\\begin{document}\n\\author{A}\n\\begin{document}');
	expect(preambleOfText('\\def\\x{50\\%}\\begin{document}\n')).toBe('\\def\\x{50\\%}\\begin{document}');
});
