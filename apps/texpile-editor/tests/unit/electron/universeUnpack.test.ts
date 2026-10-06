// A Universe template unpacked in main: a real tarball through the system tar, the [template] folder
// copied as is, and a manifest that points outside the package refused
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tarCommand } from '../../../../../electron/src/tinymist/tinymistArchive';
import { templateManifest, unpackUniverseTemplate } from '../../../../../electron/src/templates/universeUnpack';

const made: string[] = [];
const temp = () => {
	const d = mkdtempSync(join(tmpdir(), 'universe-test-'));
	made.push(d);
	return d;
};
afterEach(() => made.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function tarball(files: Record<string, string>): Uint8Array {
	const src = temp();
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(join(src, path, '..'), { recursive: true });
		writeFileSync(join(src, path), text);
	}
	const out = join(temp(), 'p.tar.gz');
	execFileSync(tarCommand(process.platform, process.env), ['-czf', out, '-C', src, '.']);
	return readFileSync(out);
}

const serve = (bytes: Uint8Array) => async () => new Response(new Blob([new Uint8Array(bytes)]));

describe('unpackUniverseTemplate', () => {
	it('copies the template folder, nested files included, and names its entry file', async () => {
		const bytes = tarball({
			'typst.toml': '[package]\nname = "paper"\nversion = "0.1.0"\n\n[template]\npath = "template"\nentrypoint = "main.typ"\n',
			'lib.typ': '#let x = 1',
			'template/main.typ': '#import "@preview/paper:0.1.0": *',
			'template/chapters/one.typ': '= One'
		});
		const dir = temp();
		expect(await unpackUniverseTemplate(serve(bytes), 'test', 'paper', '0.1.0', dir)).toEqual({ entryPath: 'main.typ' });
		expect(readdirSync(dir).sort()).toEqual(['chapters', 'main.typ']);
		expect(readFileSync(join(dir, 'chapters', 'one.typ'), 'utf8')).toBe('= One');
	});

	it('refuses a template folder outside the package', async () => {
		const bytes = tarball({ 'typst.toml': "[template]\npath = '../..'\nentrypoint = 'main.typ'\n", 'main.typ': '' });
		await expect(unpackUniverseTemplate(serve(bytes), 'test', 'paper', '0.1.0', temp())).rejects.toThrow(/entry file/);
		expect(templateManifest('[package]\nname = "x"\n')).toBeNull();
	});
});
