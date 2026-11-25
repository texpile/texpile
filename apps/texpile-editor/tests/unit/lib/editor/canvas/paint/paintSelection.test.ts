import { describe, expect, it } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { blockOnModel } from '$lib/editor/canvas/geometry/lineIndex';
import { selectionShade } from '$lib/editor/canvas/paint/paintSelection';
import { oldWordsForm } from '$lib/editor/visual/extensions/pmSuggestionForms';
import { monoMeasure } from '../testing/monoMeasure';
import { testMetrics } from '../layout/layoutFixture';
import { testModel } from '../geometry/geometryFixture';

describe('selection shade (6.4)', () => {
	// the cursor plugin's node tint shaded a crossed formula; with it gone the formula was left bare
	it('shades an inline formula the range crosses by its box', () => {
		const formula = schema.nodes.inline_math.create({ latex: 'x' }, schema.text('x'));
		const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text('ab '), formula, schema.text(' cd')])]);
		const { model } = testModel(doc);
		const block = blockOnModel(model, 0)!;
		const atom = [...block.placement.boxes].find((placed) => placed.inLine && placed.box.node?.node === formula)!;
		const shade = selectionShade(block, { from: 1, to: doc.content.size }, { measure: monoMeasure, metrics: testMetrics });
		expect(shade.over).toContainEqual({ x: atom.x, y: atom.y, width: atom.box.width, height: atom.box.height });
	});
});

// Select All left every \cref bare: the chip holds its source as text, so it was no atom to shade
it('shades a source chip the range crosses by its box', () => {
	const chip = schema.nodes.inline_latex.create(null, schema.text('\\cref{eq:m}'));
	const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text('ab '), chip, schema.text(' cd')])]);
	// drawn as the editor draws it: its words in place of its source, in a box of its own
	const { model } = testModel(doc, {
		rules: [{ selector: 'code', look: { display: 'inline-block' } }],
		prepare: (root) => {
			const face = root.querySelector('code')!;
			face.textContent = 'eq:m';
		}
	});
	const block = blockOnModel(model, 0)!;
	const box = [...block.placement.boxes].find((placed) => placed.inLine && placed.box.node?.node === chip)!;
	const shade = selectionShade(block, { from: 1, to: doc.content.size }, { measure: monoMeasure, metrics: testMetrics });
	expect(shade.over).toContainEqual({ x: box.x, y: box.y, width: box.box.width, height: box.box.height });
});

// a suggestion's old words hold no positions, so the line rects ran round them and the selection left them bare
describe('selection shade over old words', () => {
	const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text('ab cd')])]);
	const tools = { measure: monoMeasure, metrics: testMetrics };
	function shadeOver(side: number, range: { from: number; to: number }) {
		const canvas = oldWordsForm(schema, [{ text: 'old ', marks: [] }], 's', false);
		const widgets = [{ pos: 3, side, key: 'w', spec: { canvas }, marks: null, ignoreSelection: true }];
		const { model } = testModel(doc, { frameDecorations: { inline: [], nodes: new Map(), widgets } });
		// the words and their trailing space are two pieces of the line
		const over = selectionShade(blockOnModel(model, 0)!, range, tools, widgets).over;
		return over.reduce((width, rect) => width + rect.width, 0);
	}

	it('shades old words the range crosses, and the ones on its side of an edge', () => {
		expect(shadeOver(-1, { from: 1, to: 6 })).toBeCloseTo(4 * 9.6);
		expect(shadeOver(-1, { from: 1, to: 3 })).toBeCloseTo(4 * 9.6);
		expect(shadeOver(1, { from: 3, to: 6 })).toBeCloseTo(4 * 9.6);
	});

	it('leaves old words on the far side of an edge bare', () => {
		expect(shadeOver(-1, { from: 3, to: 6 })).toBe(0);
		expect(shadeOver(1, { from: 1, to: 3 })).toBe(0);
	});
});
