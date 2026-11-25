import { describe, expect, it } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { InlineDecorationView, StyleLook } from '$lib/editor/canvas';
import { changesLayout } from '$lib/editor/canvas/decorations/decorationRuns';
import { fixedStyles } from '../testing/fixedStyles';
import { testModel } from '../geometry/geometryFixture';

const LOOKS: Record<string, StyleLook> = { 'pm-comment': { backgroundColor: 'rgb(255 204 0 / 0.14)' }, mention: { padding: '0px 2px' } };

function decoration(from: number, to: number, classes: string[]): InlineDecorationView {
	const look = classes.map((name) => LOOKS[name]).find(Boolean);
	return { from, to, classes, style: '', attrs: {}, spec: look ? { canvasLook: { look } } : {} };
}

describe('inline decorations in the layout (9.5)', () => {
	it('lays out a padded decoration and leaves a tint to paint', () => {
		const styles = fixedStyles();
		expect(changesLayout(styles, decoration(1, 4, ['pm-range', 'pm-comment']))).toBe(false);
		expect(changesLayout(styles, decoration(1, 4, ['mention']))).toBe(true);
	});

	// the runs carried the tint, so the block painted it a second time and kept it after the thread was resolved
	it('cuts no run at the edges of a comment the block is laid out under', () => {
		const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('alpha beta gamma'))]);
		const texts = (inline: InlineDecorationView[]): string[] => {
			const { layouts } = testModel(doc, {
				styles: fixedStyles(),
				frameDecorations: { inline, nodes: new Map(), widgets: [] }
			});
			return (layouts[0].box.lines ?? []).flatMap((line) => line.fragments.flatMap((f) => (f.kind === 'text' ? [f.text] : [])));
		};
		expect(texts([decoration(4, 9, ['pm-range', 'pm-comment'])])).toEqual(texts([]));
		expect(texts([decoration(4, 9, ['mention'])])).toContain('alp');
	});
});
