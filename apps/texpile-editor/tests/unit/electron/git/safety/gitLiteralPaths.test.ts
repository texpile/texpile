// A file name is that file, never a pattern. To git, "a[1].tex" after `--` is a wildcard that also
// matches a1.tex: discarding the one threw away the other's changes, and the Timeline mixed their
// histories. Each name is passed as a literal pathspec (literal() in gitProcessEnv.ts), and the hooks
// git runs keep patterns of their own. These run in the helper process's environment
// (gitProcessEnv.ts), against real repositories (gitLiveFixture.ts).
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GIT_PROCESS_ENV } from '../../../../../../../electron/src/git/gitProcessEnv';
import { gitDiscard, gitStage, gitUnstage } from '../../../../../../../electron/src/git/gitService';
import { gitCommit, gitFileLog, gitLog, gitRestore, gitShowAt } from '../../../../../../../electron/src/git/history/gitHistory';
import { AVAILABLE, run, out, identify, commit, tempDir, removeTempDirs } from '../gitLiveFixture';

const saved: Record<string, string | undefined> = {};
beforeAll(() => {
	for (const [k, v] of Object.entries(GIT_PROCESS_ENV)) {
		saved[k] = process.env[k];
		process.env[k] = v;
	}
});
afterAll(() => {
	for (const [k, v] of Object.entries(saved)) {
		if (v === undefined) delete process.env[k];
		else process.env[k] = v;
	}
});
afterEach(removeTempDirs);

function makeRepo(): string {
	const root = tempDir('texpile-literal-');
	run(root, 'init', '-q');
	identify(root);
	commit(root, 'a1.tex', 'one\n', 'Add a1');
	commit(root, 'a[1].tex', 'bracket\n', 'Add the bracketed one');
	return root;
}

describe.skipIf(!AVAILABLE)('file names with [ ] in them', () => {
	it('discards only the file named, not one its name matches as a pattern', async () => {
		const root = makeRepo();
		writeFileSync(join(root, 'a1.tex'), 'one, still being written\n');
		writeFileSync(join(root, 'a[1].tex'), 'bracket, changed\n');
		expect((await gitDiscard(root, [join(root, 'a[1].tex')])).ok).toBe(true);
		expect(readFileSync(join(root, 'a[1].tex'), 'utf8')).toBe('bracket\n');
		expect(readFileSync(join(root, 'a1.tex'), 'utf8')).toBe('one, still being written\n');
	});

	it('saves only the file ticked', async () => {
		const root = makeRepo();
		writeFileSync(join(root, 'a1.tex'), 'one, not ready\n');
		writeFileSync(join(root, 'a[1].tex'), 'bracket, ready\n');
		await gitUnstage(root, []);
		await gitStage(root, [join(root, 'a[1].tex')]);
		expect((await gitCommit(root, 'Only the bracketed one')).ok).toBe(true);
		expect(out(root, 'show', '--name-only', '--format=', 'HEAD')).toBe('a[1].tex');
	});

	it("lists only that file's versions in the Timeline", async () => {
		const root = makeRepo();
		commit(root, 'a1.tex', 'one again\n', 'Edit a1');
		const log = await gitFileLog(root, join(root, 'a[1].tex'));
		expect(log.entries?.map((e) => e.subject)).toEqual(['Add the bracketed one']);
	});

	it('unstages only the file named', async () => {
		const root = makeRepo();
		writeFileSync(join(root, 'a1.tex'), 'one, staged\n');
		writeFileSync(join(root, 'a[1].tex'), 'bracket, staged\n');
		run(root, 'add', '-A');
		expect((await gitUnstage(root, [join(root, 'a[1].tex')])).ok).toBe(true);
		expect(out(root, 'diff', '--cached', '--name-only')).toBe('a1.tex');
	});

	it("lists only that folder's versions in the History", async () => {
		const root = makeRepo();
		mkdirSync(join(root, 'ch1'));
		mkdirSync(join(root, 'ch[1]'));
		commit(root, 'ch1/one.tex', 'one\n', 'Chapter one');
		commit(root, 'ch[1]/draft.tex', 'draft\n', 'The bracketed chapter');
		expect((await gitLog(join(root, 'ch[1]'))).entries?.map((e) => e.subject)).toEqual(['The bracketed chapter']);
	});

	it('restores a version from before the bracketed file existed by removing it', async () => {
		const root = makeRepo();
		const before = out(root, 'rev-parse', 'HEAD~1');
		expect((await gitRestore(root, before, 'Back to a1 only')).ok).toBe(true);
		expect(existsSync(join(root, 'a[1].tex'))).toBe(false);
		expect(existsSync(join(root, 'a1.tex'))).toBe(true);
	});
});

describe.skipIf(!AVAILABLE || process.platform === 'win32')("a hook's own patterns", () => {
	it('still match in a hook run by Save version', async () => {
		const root = tempDir('texpile-hook-');
		run(root, 'init', '-q');
		identify(root);
		commit(root, 'README', 'readme\n', 'First');
		const hook = join(root, '.git', 'hooks', 'pre-commit');
		writeFileSync(
			hook,
			`#!/bin/sh\nif git diff --cached --name-only -- '*.tex' | grep -q .; then echo "no .tex files here" >&2; exit 1; fi\n`
		);
		chmodSync(hook, 0o755);
		writeFileSync(join(root, 'main.tex'), 'main\n');
		await gitStage(root, [join(root, 'main.tex')]);

		const res = await gitCommit(root, 'A .tex file');
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/no \.tex files here/);
	});
});

describe.skipIf(!AVAILABLE)('a long path', () => {
	it('reads an older version of a file whose path is near Windows limit', async () => {
		const root = makeRepo();
		// git's own default: no long paths, so a `<version>:<path>` argument git stats as a file name
		// would be over the limit before the file itself is
		run(root, 'config', 'core.longpaths', 'false');
		const dir = 'chapters/' + 'd'.repeat(Math.max(1, 222 - root.length - 20));
		mkdirSync(join(root, dir), { recursive: true });
		commit(root, `${dir}/intro.tex`, 'The introduction.\n', 'Add the introduction');
		const res = await gitShowAt(join(root, dir, 'intro.tex'), out(root, 'rev-parse', 'HEAD'));
		expect(res).toMatchObject({ ok: true, content: 'The introduction.\n' });
	});
});
