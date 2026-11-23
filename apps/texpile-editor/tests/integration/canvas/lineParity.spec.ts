// line breaks against P0's recording of the DOM editor (18.3): the engine alone in a page, and the running canvas editor
// through the probe once the view core is in. A paragraph holding a ligature pair is listed, not failed: the DOM
// editor's breaker measured with ligatures on while its text drew them off (5.4). The large document's plain lines are
// a record only, since every document is held to Knuth-Plass (21.1)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { VITE_PORT } from '../driver/ports';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, picturesSettled } from './canvasPage';

type ParityLine = [number, number, string, number, number, number | null, number, number, number, number];
type ParityBlock = { pos: number; type: string; profile: string; box: [number, number]; irregular: number; lines: ParityLine[] };
type ParityLines = { pane: { rootClass: string }; blocks: ParityBlock[] };
type DocumentCase = { fixture: string; folder: string; file: string; parser: 'latex' | 'markdown' | 'typst' };
/** baseline: from the textblock's border box top */
type LineRange = { from: number; to: number; baseline?: number };
type EngineBlock = { pos: number; text: string; plain: boolean; width: number; lines: LineRange[] };
type DrawnBlock = { pos: number; width: number | null; plain: boolean; lines: LineRange[] };
/** skipped: textblocks laid out other than P0's (in a face still drawn from toDOM, say), with the reason */
type ParityOutcome = { compared: number; ligatures: string[]; differing: string[]; skipped: string[] };
type FoundLines = { text: string; lines: LineRange[] } | string;

const ORIGIN = `http://127.0.0.1:${VITE_PORT}`;
const GEOMETRY = path.resolve(import.meta.dirname, '../../fixtures/parity/geometry');
const DOCS = process.env.TEXPILE_PARITY_DOCS ?? '/home/user/texpile-tools/perf-drive/work/docs';
const COLUMN_WIDTH = 760;
const LIGATURE_PAIR = /f[fijlt]/;
const MISSING_FIGURE = /Failed to load resource: the server responded with a status of 40[34]/;
// P0 rounds to 0.01 px
const BASELINE_SLACK = 0.05;
const COMPARED_PROFILES = new Set(['held', 'held-ragged', 'greedy']);

const DOCUMENTS: DocumentCase[] = [
	{ fixture: 'parity-tex-tables__main_tex', folder: 'parity-tex-tables', file: 'main.tex', parser: 'latex' },
	{ fixture: 'parity-tex-theorems__main_tex', folder: 'parity-tex-theorems', file: 'main.tex', parser: 'latex' },
	{ fixture: 'parity-tex-article__main_tex', folder: 'parity-tex-article', file: 'main.tex', parser: 'latex' },
	{ fixture: 'parity-md-root__feature-sweep_md', folder: 'parity-md-root', file: 'feature-sweep.md', parser: 'markdown' },
	{ fixture: 'parity-md-root__typing_md', folder: 'parity-md-root', file: 'typing.md', parser: 'markdown' },
	{ fixture: 'parity-md-root__getting-started_md', folder: 'parity-md-root', file: 'getting-started.md', parser: 'markdown' },
	{ fixture: 'parity-md-markdown__README_md', folder: 'parity-md-markdown', file: 'README.md', parser: 'markdown' },
	{ fixture: 'parity-md-latex__README_md', folder: 'parity-md-latex', file: 'README.md', parser: 'markdown' },
	{ fixture: 'parity-typ-typst-paper__main_typ', folder: 'parity-typ-typst-paper', file: 'main.typ', parser: 'typst' },
	{ fixture: 'parity-tex-body__main_tex', folder: 'parity-tex-body', file: 'main.tex', parser: 'latex' },
	{ fixture: 'parity-typ-drive__matrix_pristine_typ', folder: 'parity-typ-drive', file: 'matrix.pristine.typ', parser: 'typst' },
	{ fixture: 'parity-typ-body__slides_typ', folder: 'parity-typ-body', file: 'slides.typ', parser: 'typst' },
	{ fixture: 'parity-typ-body__thm_typ', folder: 'parity-typ-body', file: 'thm.typ', parser: 'typst' },
	{
		fixture: 'parity-typ-typst-report__chapters_method_typ',
		folder: 'parity-typ-typst-report',
		file: 'chapters/method.typ',
		parser: 'typst'
	}
];

function recording(fixture: string): ParityLines {
	return JSON.parse(fs.readFileSync(path.join(GEOMETRY, `${fixture}@lines.json`), 'utf8')) as ParityLines;
}

/** P0's textblocks of plain text: no inline node, every character where the document has it */
function plainTextblocks(lines: ParityLines): ParityBlock[] {
	return lines.blocks.filter(
		(block) =>
			COMPARED_PROFILES.has(block.profile) &&
			block.irregular === 0 &&
			block.lines.length > 0 &&
			block.lines.every((line) => !line[2].includes('￼'))
	);
}

/** at P0's width: a list item or a table cell is narrower once its face or formatting context is in */
function atRecordedWidth(block: ParityBlock, width: number | null): boolean {
	return width !== null && Math.abs(width - block.box[0]) < 0.5;
}

// the documents' figures point outside the folder the window has a copy of
function dropMissingFigureErrors(errors: readonly string[]): void {
	expect(errors.filter((error) => !MISSING_FIGURE.test(error))).toEqual([]);
}

function compareLines(expected: readonly ParityBlock[], actual: (block: ParityBlock) => FoundLines): ParityOutcome {
	const outcome: ParityOutcome = { compared: 0, ligatures: [], differing: [], skipped: [] };
	for (const block of expected) {
		const found = actual(block);
		const text = block.lines.map((line) => line[2]).join('');
		if (typeof found === 'string' || found.text !== text) {
			outcome.skipped.push(`${block.pos}: ${typeof found === 'string' ? found : 'other text'}`);
			continue;
		}
		outcome.compared++;
		const want = block.lines.map((line) => `${line[0]}-${line[1]}`).join(' ');
		const got = found.lines.map((line) => `${line.from}-${line.to}`).join(' ');
		const shifted = found.lines.findIndex((line, i) => {
			const recorded = block.lines[i]?.[5];
			return (
				line.baseline !== undefined && recorded !== null && recorded !== undefined && Math.abs(line.baseline - recorded) > BASELINE_SLACK
			);
		});
		if (want === got && shifted < 0) continue;
		if (want === got) {
			outcome.differing.push(
				`${block.pos} line ${shifted}: P0 baseline ${block.lines[shifted][5]} canvas ${found.lines[shifted].baseline}`
			);
			continue;
		}
		const report = `${block.pos} "${text.slice(0, 40)}": P0 ${want} canvas ${got}`;
		(LIGATURE_PAIR.test(text) ? outcome.ligatures : outcome.differing).push(report);
	}
	return outcome;
}

async function openEnginePage(): Promise<{ page: Page; close: () => Promise<void> }> {
	const repo = path.resolve(import.meta.dirname, '../../../../..');
	const app = await electron.launch({
		executablePath: createRequire(path.join(repo, 'package.json'))('electron') as unknown as string,
		args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), path.join(import.meta.dirname, 'pages', 'probeWindow.mjs')],
		env: { ...process.env, PROBE_URL: `${ORIGIN}/tests/integration/canvas/pages/probe.html` }
	});
	const page = await app.firstWindow();
	await page.waitForLoadState('domcontentloaded');
	return { page, close: () => app.close() };
}

for (const parityDoc of DOCUMENTS) {
	test(`engine breaks the textblocks of ${parityDoc.fixture} as P0 recorded`, async () => {
		const source = path.join(DOCS, parityDoc.folder, parityDoc.file);
		test.skip(!fs.existsSync(source), `no ${source}`);
		const lines = recording(parityDoc.fixture);
		const expected = plainTextblocks(lines);
		const { page, close } = await openEnginePage();
		try {
			const blocks = await page.evaluate(
				async ({ text, parser, rootClass, width }) => {
					const load = (module: string): Promise<Record<string, (...args: never[]) => unknown>> => import(/* @vite-ignore */ module);
					const { engineTextblocks } = await load('/tests/integration/canvas/lineParityBlocks.ts');
					const { documentHyphenationLanguage } = await load('/src/lib/editor/canvas/layout/linebreak/documentHyphenationLanguage.ts');
					let parse: (...args: never[]) => unknown;
					if (parser === 'latex') parse = (await load('/src/lib/workspace/latexRoundtrip.ts')).parseLatexFile;
					else if (parser === 'markdown') parse = (await load('/src/lib/languages/markdown/visual/roundtrip.ts')).parseMarkdownFile;
					else {
						await (await load('/src/lib/languages/typst/syntax/typstTrees.ts')).loadTypstParser();
						parse = (await load('/src/lib/languages/typst/visual/roundtrip.ts')).parseTypstFile;
					}
					const doc = (parse as (source: string) => { doc: unknown })(text).doc;
					const language = (documentHyphenationLanguage as (source: string) => string | undefined)(text) ?? 'en-us';
					return (engineTextblocks as (...args: unknown[]) => Promise<unknown>)(doc, rootClass, width, language);
				},
				{ text: fs.readFileSync(source, 'utf8'), parser: parityDoc.parser, rootClass: lines.pane.rootClass, width: COLUMN_WIDTH }
			);
			const byPos = new Map((blocks as EngineBlock[]).map((block) => [block.pos, block]));
			const outcome = compareLines(expected, (block) => {
				const found = byPos.get(block.pos);
				if (!found) return 'not laid out';
				if (!found.plain) return 'holds an inline node';
				return atRecordedWidth(block, found.width) ? found : `width ${found.width} for ${block.box[0]}`;
			});
			await test.info().attach('outcome', { body: JSON.stringify(outcome, null, '\t'), contentType: 'application/json' });
			expect(outcome.differing).toEqual([]);
		} finally {
			await close();
		}
	});
}

test.describe('in the running app', () => {
	const files = Object.fromEntries(
		DOCUMENTS.filter((entry) => fs.existsSync(path.join(DOCS, entry.folder, entry.file))).map((entry) => [
			`${entry.folder}/${entry.file}`,
			fs.readFileSync(path.join(DOCS, entry.folder, entry.file), 'utf8')
		])
	);
	const texpile = useTexpile({ files });

	for (const parityDoc of DOCUMENTS) {
		test(`canvas breaks the textblocks of ${parityDoc.fixture} as P0 recorded`, async () => {
			const name = `${parityDoc.folder}/${parityDoc.file}`;
			test.skip(!(name in files), `no ${name}`);
			const visual = new VisualEditor(texpile().page, texpile().root);
			await visual.open(name);
			await texpile().page.waitForFunction(() => [...document.images].every((image) => image.complete));
			await picturesSettled(texpile().page);
			dropMissingFigureErrors(texpile().takeErrors());
			const hasProbe = await texpile().page.evaluate(() => '__canvasProbe' in window);
			test.skip(!hasProbe, 'the canvas probe arrives with the view core');
			const expected = plainTextblocks(recording(parityDoc.fixture));
			const drawn = await inCanvas(
				texpile().page,
				async ({ probe, view }, positions) => {
					await probe.settle();
					return positions.map((pos) => {
						const rect = probe.rectOfNode(pos);
						const lines = probe
							.lines(pos)
							.map((line) => ({ from: line.from, to: line.to, baseline: rect ? line.baseline - rect.top : undefined }));
						let plain = true;
						view.state.doc.nodeAt(pos)?.descendants((node) => (plain &&= node.isText || node.type.name === 'hard_break'));
						return { pos, width: rect?.width ?? null, plain, lines };
					});
				},
				expected.map((block) => block.pos)
			);
			dropMissingFigureErrors(texpile().takeErrors());
			const byPos = new Map((drawn as DrawnBlock[]).map((block) => [block.pos, block]));
			const outcome = compareLines(expected, (block) => {
				const found = byPos.get(block.pos);
				if (!found?.lines.length) return 'not drawn';
				if (!found.plain) return 'holds an inline node';
				if (!atRecordedWidth(block, found.width)) return `width ${found.width} for ${block.box[0]}`;
				return { text: block.lines.map((line) => line[2]).join(''), lines: found.lines };
			});
			await test.info().attach('outcome', { body: JSON.stringify(outcome, null, '\t'), contentType: 'application/json' });
			expect(outcome.differing).toEqual([]);
			expect(outcome.compared).toBeGreaterThan(0);
			expect(
				await texpile().page.evaluate(() =>
					(window as unknown as { __canvasProbe: { active(): { errors(): unknown[] } } }).__canvasProbe.active()!.errors()
				)
			).toEqual([]);
		});
	}
});
