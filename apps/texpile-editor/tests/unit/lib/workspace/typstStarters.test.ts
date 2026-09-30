// The bundled Typst starters. Each one is the first thing a new user edits, so each has to open in
// the visual editor without being rewritten (a no-edit save is byte-identical) and has to compile
// on a fresh tinymist with no network: the standard library only, no @preview packages, no font
// the embedded set lacks, and no warnings.
//
// The compile half skips itself when tinymist is not on PATH, like compileFixtures.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { STARTERS } from '$lib/workspace/starters';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';

const TYPST = STARTERS.filter((s) => s.lang === 'typst');

function hasTinymist(): boolean {
	try {
		execFileSync('tinymist', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}
const AVAILABLE = hasTinymist();

function kindsOf(src: string): string[] {
	const kinds: string[] = [];
	typstToProseMirror(src).doc.forEach((n) => kinds.push(n.type.name));
	return kinds;
}

describe('the Typst starters', () => {
	it('are the paper, report, letter and slides, with the blank document last', () => {
		expect(TYPST.map((s) => s.id)).toEqual(['typst-paper', 'typst-report', 'typst-letter', 'typst-slides', 'typst-empty']);
		for (const s of TYPST) {
			expect(s.mainFile).toBe('main.typ');
			expect(s.files['main.typ']).toBeTruthy();
			expect(s.name).toBeTruthy();
			expect(s.description).toBeTruthy();
		}
	});

	it('bundle their chapters, bibliography and figures', () => {
		const files = (id: string) => Object.keys(TYPST.find((s) => s.id === id)!.files).sort();
		expect(files('typst-paper')).toEqual(['figures/results.svg', 'main.typ', 'references.bib', 'template.typ']);
		expect(files('typst-report')).toEqual([
			'chapters/conclusion.typ',
			'chapters/introduction.typ',
			'chapters/method.typ',
			'main.typ',
			'references.bib',
			'template.typ'
		]);
	});

	it('use no packages, so a machine without network compiles them', () => {
		for (const s of TYPST) for (const [rel, text] of Object.entries(s.files)) expect(text, `${s.id}/${rel}`).not.toMatch(/@preview\//);
	});

	for (const s of TYPST)
		for (const [rel, src] of Object.entries(s.files).filter(([r]) => r.endsWith('.typ')))
			it(`${s.id}/${rel} survives a no-edit save byte for byte`, () => {
				const parsed = parseTypstFile(src);
				expect(serializeTypstFile(parsed, parsed.doc)).toBe(src);
			});

	it('open the paper as editable structure, not code', () => {
		const kinds = kindsOf(TYPST.find((s) => s.id === 'typst-paper')!.files['main.typ']);
		expect(kinds.filter((k) => k === 'heading')).toHaveLength(4);
		expect(kinds).toContain('block_math');
		expect(kinds).toContain('image');
		expect(kinds).toContain('table_wrapper');
	});

	it('open the report as a list of chapter includes', () => {
		const kinds = kindsOf(TYPST.find((s) => s.id === 'typst-report')!.files['main.typ']);
		expect(kinds.filter((k) => k === 'includedoc')).toHaveLength(3);
	});
});

let root = '';
beforeAll(() => {
	if (AVAILABLE) root = mkdtempSync(join(tmpdir(), 'typstarter-'));
});
afterAll(() => {
	if (root) rmSync(root, { recursive: true, force: true });
});

/** compile a starter as applyStarter would write it; stderr carries typst's warnings and errors */
function compileStarter(id: string): { stderr: string; pdf: Buffer } {
	const dir = join(root, 'src', id);
	for (const [rel, content] of Object.entries(TYPST.find((s) => s.id === id)!.files)) {
		mkdirSync(dirname(join(dir, rel)), { recursive: true });
		writeFileSync(join(dir, rel), content);
	}
	// not beside its source folder: tinymist reads "<folder>.pdf" as the folder itself and refuses
	const out = join(root, `${id}.pdf`);
	let stderr = '';
	try {
		// --ignore-system-fonts: the fonts typst embeds are all a user is guaranteed to have
		execFileSync('tinymist', ['compile', '--ignore-system-fonts', '--root', dir, join(dir, 'main.typ'), out], { stdio: 'pipe' });
	} catch (e) {
		const proc = e as { stderr?: Buffer; stdout?: Buffer };
		stderr = (proc.stderr?.toString() || proc.stdout?.toString() || String(e)).trim();
		return { stderr, pdf: Buffer.alloc(0) };
	}
	return { stderr, pdf: readFileSync(out) };
}

function pageCount(pdf: Buffer): number {
	return pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
}

describe.skipIf(!AVAILABLE)('the Typst starters compile cleanly', () => {
	const PAGES: Record<string, number> = { 'typst-paper': 2, 'typst-report': 7, 'typst-letter': 1, 'typst-slides': 5, 'typst-empty': 1 };
	for (const [id, pages] of Object.entries(PAGES))
		it(`${id}: ${pages} page(s), no warnings`, () => {
			const { stderr, pdf } = compileStarter(id);
			expect(stderr).toBe('');
			expect(pageCount(pdf)).toBe(pages);
		});
});
