// inline formulas laid out in text style (A11): the inline fixtures against MathLive's own markup in text style, and a
// line holding a fraction against the line P0 drew, where every formula stood at display size
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, settled } from '../canvasPage';

const DOC = [
	'\\documentclass{article}',
	'\\begin{document}',
	'',
	'A plain line of text.',
	'',
	'A line with $\\frac{a}{b}$ in it.',
	'',
	'A line with $\\displaystyle\\frac{a}{b}$ in it.',
	'',
	'\\end{document}',
	''
].join('\n');

// the paragraphs' heights in the DOM editor (canvas/p0-dom, window 1280x860): both formulas at display size
const P0_LINE = { plain: 28, frac: 31.77, displaystyle: 31.77 };

const texpile = useTexpile({ files: { 'style.tex': DOC } });

type RecordedFormula = { formula: { type: string; source: string; document: { file: string } } };
const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/parity/math');

const inlineSources = [
	...new Set(
		fs
			.readdirSync(FIXTURES)
			.filter((name) => name.endsWith('.json'))
			.map((name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8')) as RecordedFormula)
			.filter((fixture) => fixture.formula.type === 'inline_math' && !fixture.formula.document.file.endsWith('.typ'))
			.map((fixture) => fixture.formula.source)
	)
];

test('a line holding an inline fraction is shorter than P0 drew it, and \\displaystyle keeps its height', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('style.tex');
	await settled(visual.page);
	const heights = await inCanvas(visual.page, ({ probe, view }) => {
		const tops: number[] = [];
		view.state.doc.forEach((_node, offset) => tops.push(offset));
		return tops.map((pos) => probe.lines(pos)[0]?.height ?? 0);
	});
	const [plain, frac, displaystyle] = heights;
	expect(Math.abs(plain - P0_LINE.plain), 'a plain line is as P0 drew it').toBeLessThanOrEqual(1);
	expect(frac, 'the inline fraction no longer stretches its line').toBeLessThan(P0_LINE.frac - 1);
	expect(Math.abs(displaystyle - P0_LINE.displaystyle), '\\displaystyle shows its effect').toBeLessThanOrEqual(1);
});

test('inline formulas are as wide as MathLive sets them in text style, as displays are in display style', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('style.tex');
	const misses = await visual.page.evaluate(async (sources) => {
		const cache = await import(/* @vite-ignore */ '/src/lib/editor/canvas/math/mathLayoutCache.ts' as string);
		const mathlive = await import(/* @vite-ignore */ '/node_modules/.vite/deps/mathlive.js' as string);
		const host = document.createElement('div');
		Object.assign(host.style, { position: 'fixed', left: '0', top: '0', fontSize: '16px', fontFamily: 'serif', whiteSpace: 'nowrap' });
		document.body.appendChild(host);
		const found: string[] = [];
		const offBy = (source: string, display: boolean) => {
			const layout = cache.windowFormulaLayouts().layout({ syntax: 'latex', source, display }, 'serif');
			host.innerHTML = mathlive.convertLatexToMarkup(source, { defaultMode: display ? 'math' : 'inline-math' });
			return layout.width * 16 - (host.firstElementChild as HTMLElement).getBoundingClientRect().width;
		};
		// a formula display style already sets apart from its markup is W7's layout, the same in both styles
		for (const source of sources) {
			const text = offBy(source, false);
			if (Math.abs(text) > 1 && Math.abs(text - offBy(source, true)) > 0.5) found.push(`${source}: canvas off by ${text.toFixed(2)} px`);
		}
		host.remove();
		return found;
	}, inlineSources);
	expect(misses).toEqual([]);
});
