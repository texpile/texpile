// @vitest-environment jsdom
// a figure copied and pasted inside the editor comes back from its clipboard HTML, where every attr is text
import { describe, it, expect } from 'vitest';
import { DOMSerializer, DOMParser as PMDOMParser } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

describe('the image node read back from its own HTML', () => {
	it('keeps an unnumbered figure with its caption hidden, and a spanning one, as they were', () => {
		for (const attrs of [
			{ numbered: false, showCaption: false, spanning: false },
			{ numbered: true, showCaption: true, spanning: true }
		]) {
			const img = schema.nodes.image.create({ src: 'a.png', ...attrs }, schema.text('Caption'));
			const dom = document.createElement('div');
			dom.append(DOMSerializer.fromSchema(schema).serializeFragment(schema.node('doc', null, [img]).content));
			const back = PMDOMParser.fromSchema(schema).parse(dom).child(0);
			expect({ numbered: back.attrs.numbered, showCaption: back.attrs.showCaption, spanning: back.attrs.spanning }).toEqual(attrs);
		}
	});
});
