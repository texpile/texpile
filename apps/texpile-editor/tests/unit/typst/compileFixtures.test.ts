// Every Typst fixture in this suite must be code the real Typst compiler accepts.
//
// Without this, a fixture only ever has to satisfy OUR parser. That is circular: a construct we
// mis-model can be written wrongly in a test, our converter reproduces the mistake, the round trip
// agrees with itself, and the suite is green over source Typst would reject. Compiling each
// fixture with tinymist (which embeds typst) breaks the circle.
//
// Skips itself when tinymist is not on PATH, so the suite still runs on a machine without it.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { CORPUS } from './visualRoundtrip.test';
import { BLOCKS } from './labelledBlocks.test';
import { DRAWN_CORPUS } from './drawnChips.test';
import { ENVIRONMENTS } from './environments.test';
import { CITATIONS } from './citations.test';

function hasTinymist(): boolean {
	try {
		execFileSync('tinymist', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}
const AVAILABLE = hasTinymist();

/** a 1x1 PNG, so image() fixtures resolve against a real decodable file */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** the companion files the corpus refers to. A fixture that imports a template or cites a key is
 *  still legitimate Typst; it just needs its neighbours on disk to prove it. */
const COMPANIONS: Record<string, string | Buffer> = {
	'lib.typ': '#let report(title: [], doc) = { heading(title) \n doc }\n',
	'lib/template.typ': '#let report(title: [], authors: (), doc) = { heading(title) \n doc }\n',
	'content/methods.typ': '== Methods\n\nSome text.\n',
	'other.typ': '= Other\n',
	'm.typ': '#let helper = 1\n',
	'a.png': PNG,
	'b.png': PNG,
	'image.png': PNG,
	'plots/a.png': PNG,
	'c.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>\n',
	'refs.bib': '@article{typst2023, title={Typst}, author={A. Author}, year={2023}, journal={J}}\n'
};

/**
 * Fixtures that are deliberately NOT standalone-compilable, each with the reason. Being on this
 * list is a claim that has to be argued, not a way to silence a failure.
 */
const NOT_STANDALONE: Record<string, string> = {
	// exercises the parser's handling of a dangling reference; typst rejects one at compile time,
	// which is the point - the editor must not choke on source that does not yet compile
	refsLabels: 'cites @intro, a label the fixture deliberately never defines'
};

let root = '';
beforeAll(() => {
	if (!AVAILABLE) return;
	root = mkdtempSync(join(tmpdir(), 'typfix-'));
	for (const [rel, content] of Object.entries(COMPANIONS)) {
		const dest = join(root, rel);
		mkdirSync(dirname(dest), { recursive: true });
		writeFileSync(dest, content);
	}
	return () => rmSync(root, { recursive: true, force: true });
});

/** compiles one source in the shared directory; returns typst's own diagnostics on failure. */
function compile(name: string, src: string): { ok: true } | { ok: false; err: string } {
	const file = join(root, `fixture-${name}.typ`);
	writeFileSync(file, src, 'utf8');
	try {
		// --root, or tinymist rejects the entry as escaping the project ("valid virtual path")
		execFileSync('tinymist', ['compile', '--root', root, file, join(root, `${name}.pdf`)], { stdio: 'pipe' });
		return { ok: true };
	} catch (e) {
		const proc = e as { stderr?: Buffer; stdout?: Buffer };
		return { ok: false, err: (proc.stderr?.toString() || proc.stdout?.toString() || String(e)).trim() };
	}
}

describe.skipIf(!AVAILABLE)('every fixture is real Typst', () => {
	for (const [name, src] of Object.entries({ ...CORPUS, ...BLOCKS, ...DRAWN_CORPUS, ...ENVIRONMENTS, ...CITATIONS })) {
		const reason = NOT_STANDALONE[name];
		it(`${name}${reason ? ` (expected to fail: ${reason})` : ''}`, () => {
			const result = compile(name, src.endsWith('\n') ? src : `${src}\n`);
			if (reason) {
				expect(result.ok, `${name} now compiles - drop it from NOT_STANDALONE`).toBe(false);
				return;
			}
			// asserting on the message, not a boolean, so a failure prints typst's own diagnostic
			expect(result.ok === true ? '' : result.err).toBe('');
		});
	}
});
