import { describe, expect, it } from 'vitest';
import { DOMSerializer, Schema } from 'prosemirror-model';
import { renderFaceSpec, serializeFaceFragment } from '$lib/editor/canvas/tree/faceDocument';

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', { class: 'para', style: 'text-indent: 1em' }, 0] },
		text: { group: 'inline' }
	},
	marks: { strong: { toDOM: () => ['strong', 0] } }
});

describe('faceDocument', () => {
	it('renders a toDOM spec into a face tree with its hole marked', () => {
		const { dom, contentDOM } = renderFaceSpec([
			'div',
			{ class: 'wrap' },
			['http://www.w3.org/2000/svg svg', ['path', { d: 'M0 0' }]],
			['span', 0]
		]);
		expect(dom.outerHTML).toBe('<div class="wrap"><svg><path d="M0 0"></path></svg><span></span></div>');
		expect(contentDOM?.tagName).toBe('SPAN');
		expect(contentDOM?.hole).toBe(true);
		expect(dom.children[0].tagName).toBe('svg');
		expect(dom.querySelector('svg path')?.getAttribute('d')).toBe('M0 0');
	});

	it('serializes a fragment with marks through the schema', () => {
		const doc = schema.node('doc', null, [
			schema.node('paragraph', null, [schema.text('a '), schema.text('b', [schema.marks.strong.create()])])
		]);
		const fragment = serializeFaceFragment(DOMSerializer.fromSchema(schema), doc.content);
		expect(fragment.innerHTML).toBe('<p class="para" style="text-indent: 1em;">a <strong>b</strong></p>');
	});
});
