import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, settled } from './canvasPage';

const PAPER = [
	'= Results <results>',
	'',
	'The sum is $a + b$ here.',
	'',
	'#table(columns: 2, [x], [1], [y], [2])',
	'',
	'#figure(rect(width: 2cm), caption: [A box.]) <box>',
	'',
	'#columns(2)[Left words. #colbreak() Right words.]',
	''
].join('\n');

const texpile = useTexpile({ files: { 'paper.typ': PAPER } });

test('a Typst file draws its heading with its label, formula, table, figure and columns, and takes typing', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	const { page } = visual;
	await visual.open('paper.typ');
	await settled(page);
	const drawn = await inCanvas(page, ({ probe }) => {
		const heading = probe.query('h1, h2')[0];
		const label = probe.query('.text-chip, .typ-label, [data-label]').find((el) => el.text.includes('results'));
		return {
			labelBeside: !!heading && !!label && Math.abs(label.rect.top - heading.rect.top) < heading.rect.height,
			formulas: probe.query('.math-formula').length,
			figure: probe.query('.typ-figure').length,
			caption: probe.query('.typ-figure-caption')[0]?.text ?? ''
		};
	});
	expect(drawn.labelBeside, 'the label chip stands on the heading line').toBe(true);
	expect(drawn.formulas).toBe(1);
	expect(drawn.figure).toBe(1);
	expect(drawn.caption).toContain('A box.');

	await visual.caretAfter('The sum is');
	await visual.type(' then');
	await expect.poll(() => fs.readFileSync(path.join(texpile().root, 'paper.typ'), 'utf8')).toContain('The sum is then $a + b$ here.');
});
