import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseTinymistVersion, pathReachesManagedCopy, probeTinymist } from '../../../../../electron/src/typstService';

// the probe would otherwise start a login shell to recover PATH
process.env.TEXPILE_DISABLE_SHELL_ENV = '1';

// `tinymist --version` of a release build (0.15.8 from GitHub): the describe line is a placeholder
const RELEASE_LONG = [
	'tinymist ',
	'Build Timestamp:     2026-09-08T10:15:21.308568844Z',
	'Build Git Describe:  VERGEN_IDEMPOTENT_OUTPUT',
	'Commit SHA:          VERGEN_IDEMPOTENT_OUTPUT',
	'Cargo Target Triple: x86_64-unknown-linux-gnu',
	'Typst Version:       0.15.1'
].join('\n');

describe('parseTinymistVersion', () => {
	it('reads a build made from a git checkout', () => {
		expect(parseTinymistVersion('tinymist\nBuild Git Describe:  v0.15.2\nTypst Version:       0.15.0')).toEqual({
			version: '0.15.2',
			typstVersion: '0.15.0'
		});
	});

	it('does not take the placeholder a release build prints for its version', () => {
		expect(parseTinymistVersion(RELEASE_LONG)).toEqual({ version: 'unknown', typstVersion: '0.15.1' });
	});

	it('reads the short form, tinymist -V', () => {
		expect(parseTinymistVersion('tinymist 0.15.8\n').version).toBe('0.15.8');
	});
});

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-tinymist-probe-')));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function script(name: string, body: string): string {
	const file = path.join(tmp, name);
	fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
	return file;
}

describe.skipIf(process.platform === 'win32')('probeTinymist', () => {
	it("asks a release build's short form for the version its long form leaves out", async () => {
		const tm = script('release', `if [ "$1" = "-V" ]; then echo "tinymist 0.15.8"; exit 0; fi\ncat <<'EOF'\n${RELEASE_LONG}\nEOF`);
		expect(await probeTinymist(tm)).toEqual({ version: '0.15.8', typstVersion: '0.15.1' });
	});

	it('is not fooled by a program that answers --version without naming Typst', async () => {
		expect(await probeTinymist(script('other', 'echo "v24.19.0"'))).toBeNull();
	});

	it('is null for a program that is not there', async () => {
		expect(await probeTinymist(path.join(tmp, 'missing'))).toBeNull();
	});
});

// Texpile's copy picked as the Typst distribution runs through PATH, and is still Texpile's copy
it("tells Texpile's own tinymist on PATH from a copy of the user's own", () => {
	const exe = process.platform === 'win32' ? 'tinymist.exe' : 'tinymist';
	const data = path.join(tmp, 'data');
	const own = path.join(tmp, 'own');
	for (const dir of [path.join(data, 'tinymist'), own]) {
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, exe), '');
	}
	const linked = path.join(tmp, 'linked');
	fs.symlinkSync(path.join(data, 'tinymist'), linked, 'junction');
	const onPath = (...dirs: string[]) => dirs.join(path.delimiter);
	expect(pathReachesManagedCopy(onPath(path.join(tmp, 'none'), path.join(data, 'tinymist'), own), data)).toBe(true);
	expect(pathReachesManagedCopy(onPath(linked, own), data)).toBe(true);
	expect(pathReachesManagedCopy(onPath(own, path.join(data, 'tinymist')), data)).toBe(false);
	expect(pathReachesManagedCopy('', data)).toBe(false);
});
