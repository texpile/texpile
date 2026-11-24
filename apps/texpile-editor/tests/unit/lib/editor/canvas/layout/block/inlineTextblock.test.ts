import { expect, it } from 'vitest';
import { Schema } from 'prosemirror-model';
import { termItemSpec, termTitleSpec } from '$lib/languages/typst/visual/plugins/term/termSchema';
import type { FixedStyleRule } from '../../testing/fixedStyles';
import { testModel } from '../../geometry/geometryFixture';

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
		term_title: termTitleSpec,
		term_item: termItemSpec,
		text: { group: 'inline' }
	}
});
// TypstEditorView's .term-title + p
const RULES: FixedStyleRule[] = [{ selector: '.term-item > p', look: { display: 'inline' } }];

it('lays out a paragraph set display: inline after a block, with its rect and caret', () => {
	const { term_item, term_title, paragraph } = schema.nodes;
	const item = term_item.create(null, [
		term_title.create(null, schema.text('Term')),
		paragraph.create(null, schema.text('its description'))
	]);
	const { geometry } = testModel(schema.nodes.doc.create(null, item), { rules: RULES });
	const descriptionPos = 1 + 'Term'.length + 2;
	const lines = geometry.linesOf(descriptionPos);
	expect(lines).toHaveLength(1);
	expect([lines[0].from, lines[0].to]).toEqual([descriptionPos + 1, descriptionPos + 1 + 'its description'.length]);
	expect(geometry.nodeRect(descriptionPos)?.rect.height).toBeGreaterThan(0);
	const caret = geometry.caretRect({ pos: descriptionPos + 4, affinity: 1 });
	expect(caret?.x).toBeGreaterThan(0);
	expect(caret!.y).toBeGreaterThanOrEqual(lines[0].top);
	expect(caret!.y).toBeLessThan(lines[0].bottom);
});
