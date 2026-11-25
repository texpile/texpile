import { describe, expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import type { BlockLayout, CanvasStyles, LayoutBox, LineBox } from '$lib/editor/canvas';
import { layoutBlock } from '$lib/editor/canvas/layout/layoutElement';
import { ViewLineBreaking } from '$lib/editor/canvas/layout/linebreak/viewBreaking';
import { fixedStyles } from '../../testing/fixedStyles';
import { monoMeasure } from '../../testing/monoMeasure';
import { testSchema } from '../../testing/testCanvasView';
import { testBlockElements, testMetrics } from '../layoutFixture';

const WORDS = 'the reader follows each line of this paragraph across the narrow column of the page';
const { blockquote, paragraph } = testSchema.nodes;

function quote(texts: readonly string[]): PMNode {
	return blockquote.create(
		null,
		texts.map((text) => paragraph.create(null, testSchema.text(text)))
	);
}

/** the quote laid out at a narrow width, counting the text measured */
function layOut(top: PMNode, styles: CanvasStyles, breaking: ViewLineBreaking, previous: BlockLayout | null = null) {
	let measured = 0;
	const measure = Object.assign((font: string, text: string) => (measured++, monoMeasure(font, text)), monoMeasure);
	const { root, positions } = testBlockElements(top);
	const settings = { justify: true, hyphenate: false, showCaptions: true, imageDirectory: '', cropFormat: '', isMainFile: true };
	const request = {
		node: top,
		pos: 0,
		root,
		positions,
		widgets: new Map(),
		width: 200,
		styles,
		decorations: { inline: [], nodes: new Map(), widgets: [] },
		breaking,
		settings,
		pixelRatio: 1,
		previous
	};
	return { layout: layoutBlock(request, { measure, metrics: testMetrics }), measured };
}

function linesOf(box: LayoutBox, into: LineBox[][] = []): LineBox[][] {
	if (box.lines) into.push([...box.lines]);
	for (const child of box.children) linesOf(child, into);
	return into;
}

function positionsOf(lines: readonly LineBox[]) {
	return lines.map((line) => ({
		from: line.from,
		to: line.to,
		texts: line.fragments.map((f) => (f.kind === 'text' ? [f.text, f.from, f.to, f.x] : f.kind))
	}));
}

describe('lines kept by node between layouts of a block', () => {
	it('breaks the edited paragraph alone and moves the others to their new offsets', () => {
		const styles = fixedStyles();
		const breaking = new ViewLineBreaking(() => 'none');
		const before = quote([WORDS, WORDS, WORDS]);
		const edited = quote([`more ${WORDS}`, WORDS, WORDS]);
		const after = blockquote.create(null, [edited.child(0), before.child(1), before.child(2)]);
		const first = layOut(before, styles, breaking);
		const reused = layOut(after, styles, breaking, first.layout);
		const fresh = layOut(after, styles, breaking);
		expect(linesOf(reused.layout.box).map(positionsOf)).toEqual(linesOf(fresh.layout.box).map(positionsOf));
		expect(reused.measured).toBeLessThan(fresh.measured / 2);
	});

	it('keeps the very line boxes of paragraphs above the edit', () => {
		const styles = fixedStyles();
		const breaking = new ViewLineBreaking(() => 'none');
		const before = quote([WORDS, WORDS]);
		const after = blockquote.create(null, [before.child(0), paragraph.create(null, testSchema.text(`${WORDS} more`))]);
		const first = layOut(before, styles, breaking);
		const reused = layOut(after, styles, breaking, first.layout);
		expect(linesOf(reused.layout.box)[0]).toEqual(linesOf(first.layout.box)[0]);
		expect(linesOf(reused.layout.box)[0][0]).toBe(linesOf(first.layout.box)[0][0]);
	});
});
