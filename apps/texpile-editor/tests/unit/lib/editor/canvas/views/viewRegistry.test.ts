// @vitest-environment jsdom
import { Schema } from 'prosemirror-model';
import { createListSpec } from 'prosemirror-flat-list';
import { describe, expect, it } from 'vitest';
import { PLAIN_FACE_MEDIA } from '$lib/editor/canvas/views/faceContext';
import { renderToDom } from '$lib/editor/canvas/views/viewRegistry';
import { recordingContext } from '../paint/recordingContext';

const schema = new Schema({
	nodes: { doc: { content: 'block+' }, paragraph: { group: 'block', content: 'text*' }, list: createListSpec(), text: {} }
});

function taskBox(checked: boolean) {
	const node = schema.nodes.list.create({ kind: 'task', checked }, schema.nodes.paragraph.create(null, schema.text('a task')));
	return renderToDom(node, PLAIN_FACE_MEDIA.checkbox).dom.querySelector('input[type="checkbox"]')!;
}

describe('a node drawn from its toDOM', () => {
	// - [x] in Markdown: the DOM editor showed the browser's checkbox in the item's marker
	it('draws a task item checkbox, with its check only when checked', () => {
		const paint = (checked: boolean) => {
			const box = taskBox(checked);
			expect(box.replaced!.intrinsic({} as never)).toEqual({ width: 13, height: 13 });
			const { context, draws } = recordingContext();
			box.replaced!.paint(context, { x: 0, y: 0, width: 13, height: 13 }, {} as never, () => ({ r: 0, g: 0, b: 0, a: 1 }));
			return draws.map((draw) => draw.call);
		};
		expect(paint(false)).toEqual(['fill', 'stroke']);
		expect(paint(true)).toEqual(['fill', 'stroke', 'stroke']);
	});
});
