// a folder opened through a link: the paths the window shows and the paths git takes have to line
// up, whether the link points straight at the project or sits inside the repository
import { describe, it, expect, afterEach } from 'vitest';
import { symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RepoPaths } from '../../../../../../electron/src/git/gitRepoPaths';
import { gitShowHead, gitStage, gitStatus } from '../../../../../../electron/src/git/gitService';
import { gitCommit } from '../../../../../../electron/src/git/history/gitHistory';
import { AVAILABLE, run, out, identify, commit, tempDir, removeTempDirs } from './gitLiveFixture';

// every link points inside its own test's temp folder, and goes before the folder does
const links: string[] = [];
function link(target: string, path: string): string {
	symlinkSync(target, path, 'junction');
	links.push(path);
	return path;
}

afterEach(() => {
	for (const l of links.splice(0)) unlinkSync(l);
	removeTempDirs();
});

describe('RepoPaths', () => {
	it('spells paths as before without a link, and under the opened folder with a link inside the repository', () => {
		const root = resolve('/work/repo');
		const thesis = join(root, 'thesis');
		const plain = new RepoPaths(root, root, thesis, thesis, 'thesis/');
		expect(plain.toGit([join(thesis, 'ch', 'a.tex'), thesis, join(root, 'code', 'x.py')])).toEqual([
			'thesis/ch/a.tex',
			'thesis',
			'code/x.py'
		]);
		expect(plain.fromGit('thesis/ch/a.tex')).toBe(join(thesis, 'ch', 'a.tex'));
		expect(plain.fromGit('code/x.py')).toBe(join(root, 'code', 'x.py'));
		expect([plain.holds('thesis/a.tex'), plain.holds('thesis'), plain.holds('code/x.py')]).toEqual([true, false, false]);

		// current -> drafts/v3, opened as current
		const current = join(root, 'current');
		const linked = new RepoPaths(root, root, current, join(root, 'drafts', 'v3'), 'drafts/v3/');
		expect(linked.toGit([join(current, 'main.tex'), current])).toEqual(['drafts/v3/main.tex', 'drafts/v3']);
		expect(linked.fromGit('drafts/v3/main.tex')).toBe(join(current, 'main.tex'));
		expect(linked.fromGit('intro.tex')).toBe(join(root, 'intro.tex'));
		expect([linked.holds('drafts/v3/main.tex'), linked.holds('drafts/v2/main.tex')]).toEqual([true, false]);
	});
});

describe.skipIf(!AVAILABLE)('a folder opened through a link from outside, straight at the project', () => {
	it('keeps the repository where the folder was opened, as before', async () => {
		const real = tempDir('texpile-real-');
		run(real, 'init', '-q');
		identify(real);
		commit(real, 'main.tex', 'First.\n', 'First draft');
		const opened = link(real, join(tempDir('texpile-link-'), 'paper'));
		const main = join(opened, 'main.tex');
		writeFileSync(main, 'Second.\n');

		const status = await gitStatus(opened);
		expect(status.repoRoot).toBe(opened);
		expect(status.entries).toEqual([{ path: main, x: ' ', y: 'M' }]);
		expect((await gitShowHead(main)).content).toBe('First.\n');
		expect(await gitStage(opened, [main])).toEqual({ ok: true });
		expect(await gitCommit(opened, 'Second draft')).toEqual({ ok: true });
		expect(out(real, 'show', '--name-only', '--format=', 'HEAD')).toBe('main.tex');
	});
});
