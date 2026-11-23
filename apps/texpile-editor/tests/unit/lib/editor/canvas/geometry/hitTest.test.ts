import { describe, expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { faceElement, type LineBox, type LineFragment } from '$lib/editor/canvas';
import type { FixedStyleRule } from '../testing/fixedStyles';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { createCanvasGeometry } from '$lib/editor/canvas/geometry/canvasGeometry';
import { inlineHitChain, inlineHitRange } from '$lib/editor/canvas/tree/inlineHitChain';
import { monoMeasure } from '../testing/monoMeasure';
import { testMetrics } from '../layout/layoutFixture';
import { pointAt, testModel } from './geometryFixture';

const RULES: FixedStyleRule[] = [
	{ selector: 'p', look: { margin: '0px 0px 16px' } },
	{ selector: 'blockquote', look: { padding: '0px 0px 0px 40px' } },
	{ selector: 'hr', look: { height: '20px', margin: '8px 0px' } },
	{ selector: '.label-node', look: { display: 'inline-block', width: '30px', height: '16px' } }
];

// 31 characters of 9.6 px fit the 300 px column
const { paragraph, blockquote, horizontal_rule: rule, label } = schema.nodes;
const first = paragraph.create(null, schema.text('alpha beta gamma delta epsilon zeta eta theta'));
const quoted = blockquote.create(null, paragraph.create(null, schema.text('inner words')));
const last = paragraph.create(null, [schema.text('tail '), label.create(), schema.text(' end')]);
const doc = schema.nodes.doc.create(null, [first, quoted, rule.create(), last]);
const firstPos = 0;
const quotePos = first.nodeSize;
const innerPos = quotePos + 1;
const rulePos = quotePos + quoted.nodeSize;
const lastPos = rulePos + 1;
const labelPos = lastPos + 1 + 'tail '.length;

const { geometry, model } = testModel(doc, { rules: RULES });
const hit = (x: number, y: number) => geometry.hit({ x, y })!;
const box = (pos: number) => geometry.nodeRect(pos)!.rect;

describe('hit rules (7.4)', () => {
	it('1 root: above the first block the first stop and pos 0, below the last the last stop and the document end', () => {
		const top = hit(50, -10);
		expect([top.pos, top.inside, top.caret, top.target]).toEqual([0, -1, { pos: 1, affinity: 1 }, { kind: 'margin', side: 'above' }]);
		const foot = hit(50, model.height + 40);
		expect([foot.pos, foot.inside, foot.caret.pos, foot.target]).toEqual([
			doc.content.size,
			-1,
			doc.content.size - 1,
			{ kind: 'margin', side: 'below' }
		]);
	});

	it('1 root: a point in the first block leaves the last block unlaid', () => {
		const laid: number[] = [];
		const counted = testModel(doc, { rules: RULES });
		const layout = counted.model.layout;
		Object.assign(counted.model, { layout: (index: number) => (laid.push(index), layout(index)) });
		counted.geometry.hit(pointAt(counted.geometry, 8));
		expect(laid).not.toContain(counted.model.count - 1);
	});

	it('1 root: in a side margin the caret clamps into the column and the target is the margin', () => {
		const { y } = pointAt(geometry, 8);
		const left = hit(-20, y);
		expect([left.caret.pos, left.target, left.inside, left.pos]).toEqual([1, { kind: 'margin', side: 'left' }, -1, firstPos]);
	});

	it('2 blocks: a point between two blocks gives the boundary before the next, its caret on the next block', () => {
		const gap = box(firstPos).y + box(firstPos).height + 8;
		const between = hit(30, gap);
		expect([between.pos, between.inside]).toEqual([quotePos, -1]);
		expect(between.target).toEqual({ kind: 'between', before: firstPos, after: quotePos });
		expect(geometry.lineOf(between.caret)!.ref.textblock).toBe(innerPos);
	});

	it('2 blocks: the horizontal test applies to the innermost block only', () => {
		const { y } = pointAt(geometry, innerPos + 2);
		const padding = hit(10, y);
		expect([padding.pos, padding.inside, padding.caret.pos]).toEqual([innerPos, quotePos, innerPos + 1]);
	});

	it('3 leaves: a block leaf by its upper or lower half, an inline leaf by its left or right half', () => {
		const hr = box(rulePos);
		expect([hit(20, hr.y + 4).pos, hit(20, hr.y + 16).pos, hit(20, hr.y + 4).inside]).toEqual([rulePos, rulePos + 1, rulePos]);
		const atom = box(labelPos);
		const y = atom.y + atom.height / 2;
		expect([hit(atom.x + 5, y).pos, hit(atom.x + 25, y).pos, hit(atom.x + 5, y).inside]).toEqual([labelPos, labelPos + 1, labelPos]);
	});

	it('3 leaves: an inline formula without its face is hit whole, its source drawn inside it', () => {
		const formula = schema.nodes.inline_math.create(null, schema.text('x^2'));
		const own = testModel(schema.nodes.doc.create(null, paragraph.create(null, [schema.text('see '), formula])), { rules: RULES });
		const rect = own.geometry.nodeRect(5)!.rect;
		const inside = own.geometry.hit({ x: rect.x + 4, y: rect.y + rect.height / 2 })!;
		expect([rect.width > 20, inside.target]).toEqual([true, { kind: 'leaf', pos: 5, policy: 'atom' }]);
	});

	it('4 text: the line under the point, then the nearest stop by the half-glyph rule', () => {
		const { y } = pointAt(geometry, 1);
		// p runs from 19.2 to 28.8
		expect([hit(22, y).caret, hit(25, y).caret]).toEqual([
			{ pos: 3, affinity: 1 },
			{ pos: 4, affinity: 1 }
		]);
		const second = geometry.linesOf(firstPos)[1];
		expect(hit(3, (second.top + second.bottom) / 2).caret.pos).toBe(second.from);
	});

	it('4 text: past a wrapped line drawn end, its last stop with affinity -1', () => {
		const [line] = geometry.linesOf(firstPos);
		const past = hit(line.right + 2, (line.top + line.bottom) / 2);
		expect(past.caret).toEqual({ pos: line.to, affinity: -1 });
		expect(geometry.caretRect(past.caret)!.y).toBe(geometry.caretRect({ pos: line.from, affinity: 1 })!.y);
	});

	it('4 text: a point over a generated hyphen maps to the break with affinity -1', () => {
		const hyphenated = testModel(doc, { rules: RULES });
		const line = hyphenated.layouts[0].box.lines![0] as LineBox & { hyphen: LineFragment | null; fragments: LineFragment[] };
		const end = line.fragments.filter((fragment) => fragment.kind === 'text').at(-1)!;
		const hyphen: LineFragment = { kind: 'hyphen', x: end.x + end.width, width: 6, run: end.run, at: 0 };
		Object.assign(line, { hyphen, fragments: [...line.fragments, hyphen] });
		const placed = hyphenated.geometry.linesOf(firstPos)[0];
		expect(hyphenated.geometry.hit({ x: placed.hyphen!.x + 3, y: placed.baseline - 2 })!.caret).toEqual({ pos: placed.to, affinity: -1 });
	});

	it('5 the caret never lands inside a leaf: an inline atom gives its nearer side, a drawn block the nearest text by height', () => {
		const atom = box(labelPos);
		const y = atom.y + atom.height / 2;
		expect([hit(atom.x + 5, y).caret.pos, hit(atom.x + 25, y).caret.pos]).toEqual([labelPos, labelPos + 1]);
		const hr = box(rulePos);
		const near = hit(20, hr.y + 16).caret;
		expect(geometry.lineOf(near)!.ref.textblock).toBe(lastPos);
		expect(geometry.lineOf(hit(20, hr.y + 2).caret)!.ref.textblock).toBe(innerPos);
	});

	it('the text cursor over an editable textblock past its line ends and between blocks, the arrow over a leaf', () => {
		const lines = geometry.linesOf(firstPos);
		const last = lines[lines.length - 1];
		expect(hit(last.right + 20, (last.top + last.bottom) / 2).cursor).toBe('text');
		expect(hit(30, box(firstPos).y + box(firstPos).height + 8).cursor).toBe('text');
		const atom = box(labelPos);
		expect(hit(atom.x + 5, atom.y + atom.height / 2).cursor).toBe('default');
	});

	it('6 inside: the innermost node holding the point, -1 outside every top-level block', () => {
		expect(hit(...(Object.values(pointAt(geometry, innerPos + 3)) as [number, number])).inside).toBe(innerPos);
		const { y } = pointAt(geometry, innerPos + 3);
		expect(hit(20, y).inside).toBe(quotePos);
		expect(hit(30, box(firstPos).y + box(firstPos).height + 8).inside).toBe(-1);
	});
});

describe('a click between two lines', () => {
	// 27 px lines of a 16 px font leave 11 px of leading, split 5 above and 6 below
	const { geometry: spaced } = testModel(schema.nodes.doc.create(null, [first]), {
		rules: [{ selector: 'p', look: { lineHeight: '27px' } }]
	});

	it('goes to the line whose caret is nearer where the leading splits unevenly', () => {
		const [upper, lower] = spaced.linesOf(firstPos);
		const middle = (upper.textBottom + lower.textTop) / 2;
		expect(middle).toBeLessThan(upper.bottom);
		const lineAnswered = (y: number) => spaced.lineOf(spaced.hit({ x: 20, y })!.caret)!.top;
		expect([lineAnswered(middle - 0.2), lineAnswered(middle + 0.2)]).toEqual([upper.top, lower.top]);
	});
});

const tableSchema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
		table: { group: 'block', content: 'row+', tableRole: 'table', toDOM: () => ['div', { class: 'table' }, 0] },
		row: { content: 'cell+', tableRole: 'row', toDOM: () => ['div', { class: 'row' }, 0] },
		cell: { content: 'paragraph+', tableRole: 'cell', toDOM: () => ['div', { class: 'cell' }, 0] },
		card: {
			group: 'block',
			content: 'paragraph',
			toDOM: () => ['div', { class: 'card' }, ['div', { class: 'card-head' }], ['div', { class: 'card-body' }, 0]]
		},
		text: {}
	}
});
const { table, row, cell, card } = tableSchema.nodes;
const text = (words: string) => tableSchema.nodes.paragraph.create(null, tableSchema.text(words));

describe('hit rules in cells and face parts (7.4)', () => {
	it('7 cells: the cell holding the point, its content hit inside it', () => {
		const tableDoc = tableSchema.nodes.doc.create(null, [table.create(null, row.create(null, [cell.create(null, text('one'))]))]);
		const { geometry: cells } = testModel(tableDoc);
		const found = cells.hit(pointAt(cells, 5, 3))!;
		expect(found.target).toEqual({ kind: 'cell', cellPos: 2, tablePos: 0, inner: { kind: 'text', textblock: 3 } });
	});

	it('8 face parts: an anchor under the point, a resize handle by its name, pointer-events none passed through', () => {
		const head: FixedStyleRule = { selector: '.card-head', look: { height: '20px' } };
		const cardDoc = tableSchema.nodes.doc.create(null, [card.create(null, text('body'))]);
		const anchored = (anchor: string, rules: FixedStyleRule[] = [head]) =>
			testModel(cardDoc, {
				rules,
				prepare: (root) => {
					root.querySelector('.card-head')!.anchor = anchor;
				}
			}).geometry.hit({ x: 10, y: 10 })!;
		expect(anchored('title').target).toEqual({ kind: 'facePart', pos: 0, part: 'title' });
		expect(anchored('handle-se').target).toEqual({ kind: 'handle', pos: 0, handle: 'se' });
		const passing = anchored('title', [head, { selector: '.card-head', look: { pointerEvents: 'none' } }]);
		expect([passing.target.kind, passing.inside]).toEqual(['between', 0]);
	});
});

describe('inside a face drawn whole', () => {
	it('the element under the point heads the chain, so its handlers and hint answer, while the target stays the leaf', () => {
		const ruleDoc = schema.nodes.doc.create(null, [rule.create()]);
		const { geometry: drawn } = testModel(ruleDoc, {
			rules: [
				{ selector: 'hr', look: { height: '20px' } },
				{ selector: '.face-button', look: { display: 'block', width: '30px', height: '10px' } }
			],
			prepare: (root) => {
				root.appendChild(faceElement('span', 'face-button'));
			}
		});
		const found = drawn.hit({ x: 5, y: 5 })!;
		expect(found.chain[0].className).toBe('face-button');
		expect(found.target.kind).toBe('leaf');
	});

	it('an element placed past its parent box answers, as the figure card pencil beside its picture, unless the parent clips', () => {
		const ruleDoc = schema.nodes.doc.create(null, [rule.create()]);
		const hitBeside = (frame: FixedStyleRule['look']) =>
			testModel(ruleDoc, {
				rules: [
					{ selector: 'hr', look: { height: '20px' } },
					{ selector: '.face-frame', look: { display: 'block', position: 'relative', width: '50px', height: '20px', ...frame } },
					{
						selector: '.face-button',
						look: { display: 'block', position: 'absolute', top: '0px', left: '100%', width: '30px', height: '10px' }
					}
				],
				prepare: (root) => {
					root.appendChild(faceElement('div', 'face-frame')).appendChild(faceElement('span', 'face-button'));
				}
			}).geometry.hit({ x: 60, y: 5 })!;
		expect(hitBeside({}).chain[0].className).toBe('face-button');
		expect(hitBeside({ overflow: 'hidden' }).chain[0].className).not.toBe('face-button');
	});
});

describe('the elements text would have had (3.4)', () => {
	it("a point on the far half of a word's last letter is on the word: its decoration is in the chain, wrapping the word", () => {
		const words = schema.nodes.doc.create(null, [paragraph.create(null, schema.text('alpha beta gamma'))]);
		const decorations = DecorationSet.create(words, [Decoration.inline(7, 11, { class: 'proofread-spelling' })]);
		const { model } = testModel(words, { decorations });
		const chained = createCanvasGeometry(model, { measure: monoMeasure, metrics: testMetrics, inlineChain: inlineHitChain });
		const { y } = pointAt(chained, 10);
		const found = chained.hit({ x: 10 * 9.6 - 2, y })!;
		expect(found.caret.pos).toBe(11);
		expect(found.chain[0].className).toBe('proofread-spelling');
		expect(inlineHitRange(found.chain[0])).toEqual({ from: 7, to: 11 });
	});
});
