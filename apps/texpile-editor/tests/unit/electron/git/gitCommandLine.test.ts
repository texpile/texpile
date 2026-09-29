// more files than one Windows command line holds, which failed every add, reset, checkout and
// folder commit past about 800 of them
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { MAX_CLI_LENGTH, splitInChunks } from '../../../../../../electron/src/git/gitCommandLine';
import { gitDiscard, gitStage, gitUnstage } from '../../../../../../electron/src/git/gitService';
import { gitCommit } from '../../../../../../electron/src/git/history/gitHistory';
import { AVAILABLE, run, out, identify, commit, tempDir, removeTempDirs } from './gitLiveFixture';

afterEach(removeTempDirs);

describe('splitInChunks', () => {
	it('cuts where the paths, with a space and quotes each, would pass the limit', () => {
		expect([...splitInChunks(['hello', 'there', 'cool', 'stuff'], 16)]).toEqual([
			['hello', 'there'],
			['cool', 'stuff']
		]);
		expect([...splitInChunks(['longer-than-the-limit.tex', 'a.tex'], 10)]).toEqual([['longer-than-the-limit.tex'], ['a.tex']]);
		expect([...splitInChunks([], 10)]).toEqual([]);

		const names = Array.from({ length: 5000 }, (_, i) => `:(literal)${i}.tex`);
		const chunks = [...splitInChunks(names)];
		expect(chunks.flat()).toEqual(names);
		for (const chunk of chunks) expect(chunk.map((p) => `"${p}"`).join(' ').length).toBeLessThanOrEqual(MAX_CLI_LENGTH);
	});
});

describe.skipIf(!AVAILABLE)('more files than fit on one Windows command line', () => {
	it('are staged, unstaged, saved and put back, in a folder of a larger repository', async () => {
		const root = tempDir('texpile-many-');
		run(root, 'init', '-q');
		identify(root);
		mkdirSync(join(root, 'code'));
		commit(root, 'code/analysis.py', 'print(1)\n', 'Code');
		// staged outside the folder, so the version is saved with --only and a list of its files
		writeFileSync(join(root, 'code/analysis.py'), 'print(2)\n');
		run(root, 'add', 'code/analysis.py');

		const project = join(root, 'thesis');
		const sections = join(project, 'sections-of-the-long-appendix');
		mkdirSync(sections, { recursive: true });
		const paths = Array.from({ length: 1200 }, (_, i) => join(sections, `section-${String(i).padStart(4, '0')}.tex`));
		for (const p of paths) writeFileSync(p, 'Draft.\n');
		expect(paths.map((p) => relative(root, p)).join(' ').length).toBeGreaterThan(32767);

		expect(await gitStage(project, paths)).toEqual({ ok: true });
		expect(await gitUnstage(project, paths)).toEqual({ ok: true });
		expect(out(root, 'diff', '--cached', '--name-only')).toBe('code/analysis.py');

		expect(await gitStage(project, paths)).toEqual({ ok: true });
		expect(await gitCommit(project, 'Every section')).toEqual({ ok: true });
		expect(out(root, 'show', '--name-only', '--format=', 'HEAD').split('\n')).toHaveLength(paths.length);
		expect(out(root, 'diff', '--cached', '--name-only')).toBe('code/analysis.py');

		for (const p of paths) writeFileSync(p, 'Rewritten.\n');
		expect(await gitDiscard(project, paths)).toEqual({ ok: true });
		expect(paths.filter((p) => readFileSync(p, 'utf8') !== 'Draft.\n')).toEqual([]);
	}, 120_000);
});
