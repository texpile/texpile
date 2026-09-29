// Listing and switching branches, against real repos (gitLiveFixture.ts).
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitBranches, gitSwitch, parseRefs } from '../../../../../../../electron/src/git/history/gitBranches';
import { AVAILABLE, run, out, commit, removeTempDirs, makePublished } from '../gitLiveFixture';

afterEach(removeTempDirs);

describe.skipIf(!AVAILABLE)('branches', () => {
	it('lists the local branches, and apart from them the remote ones no local branch follows', async () => {
		const { root, other } = await makePublished();
		run(other, 'switch', '-q', '-c', 'appendix');
		commit(other, 'appendix.tex', 'Appendix.\n', 'Start the appendix');
		run(other, 'push', '-q', '-u', 'origin', 'appendix');
		run(root, 'fetch', '-q');
		run(root, 'branch', 'draft');

		const res = await gitBranches(root);
		const main = out(root, 'branch', '--show-current');
		expect(res.current).toBe(main);
		expect(res.local?.map((b) => b.name).sort()).toEqual(['draft', main].sort());
		expect(res.local?.find((b) => b.name === main)?.upstream).toBe(`origin/${main}`);
		// origin/HEAD and origin/<main> are not offered: one points elsewhere, main follows the other
		expect(res.remote?.map((b) => b.name)).toEqual(['origin/appendix']);
	});

	it("checks out a co-author's branch as a local branch that follows it, and returns to that one", async () => {
		const { root, other } = await makePublished();
		const main = out(root, 'branch', '--show-current');
		run(other, 'switch', '-q', '-c', 'appendix');
		commit(other, 'appendix.tex', 'Appendix.\n', 'Start the appendix');
		run(other, 'push', '-q', '-u', 'origin', 'appendix');
		run(root, 'fetch', '-q');

		expect(await gitSwitch(root, 'origin/appendix')).toEqual({ ok: true, branch: 'appendix' });
		expect(out(root, 'rev-parse', '--abbrev-ref', 'appendix@{upstream}')).toBe('origin/appendix');
		expect(readFileSync(join(root, 'appendix.tex'), 'utf8')).toBe('Appendix.\n');
		run(root, 'switch', '-q', main);
		expect(await gitSwitch(root, 'origin/appendix')).toEqual({ ok: true, branch: 'appendix' });
	});

	it('switches, bringing along unsaved work that does not collide', async () => {
		const { root } = await makePublished();
		run(root, 'branch', 'draft');
		writeFileSync(join(root, 'notes.tex'), 'Typed, not saved as a version.\n');
		expect(await gitSwitch(root, 'draft')).toEqual({ ok: true, branch: 'draft' });
		expect(readFileSync(join(root, 'notes.tex'), 'utf8')).toBe('Typed, not saved as a version.\n');
	});

	it('refuses to overwrite unsaved work, and names the file', async () => {
		const { root } = await makePublished();
		const main = out(root, 'branch', '--show-current');
		run(root, 'switch', '-q', '-c', 'draft');
		commit(root, 'main.tex', 'The draft wording.\n', 'Reword');
		run(root, 'switch', '-q', main);
		writeFileSync(join(root, 'main.tex'), 'Typed on main, not saved.\n');
		const res = await gitSwitch(root, 'draft');
		expect(res).toMatchObject({ ok: false, failure: 'dirty', files: [join(root, 'main.tex')] });
		expect(out(root, 'branch', '--show-current')).toBe(main);
		expect(readFileSync(join(root, 'main.tex'), 'utf8')).toBe('Typed on main, not saved.\n');
	});

	it('will not switch to a branch that is not there, or in the middle of a merge', async () => {
		const { root } = await makePublished();
		expect(await gitSwitch(root, 'nothing')).toMatchObject({ ok: false, failure: 'missing' });
		writeFileSync(join(root, '.git', 'MERGE_HEAD'), out(root, 'rev-parse', 'HEAD') + '\n');
		expect(await gitSwitch(root, 'nothing')).toMatchObject({ ok: false, failure: 'busy' });
	});
});

describe('reading the branch list', () => {
	it('keeps slashes in branch names, and a branch with no upstream', () => {
		const raw = ['main\x1forigin/main\x1f2026-01-02T00:00:00Z', 'topic/a\x1f\x1f2026-01-01T00:00:00Z', ''].join('\n');
		expect(parseRefs(raw).map((b) => [b.name, b.upstream])).toEqual([
			['main', 'origin/main'],
			['topic/a', null]
		]);
	});
});
