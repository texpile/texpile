import { describe, expect, it } from 'vitest';
import { Schema, type Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import { placeholderPlugin } from '$lib/editor/visual/extensions/placeholderplugin';

const schema = new Schema({
	nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*', group: 'block' }, text: {} }
});

describe('placeholderPlugin', () => {
	it('marks a lone empty paragraph and leaves it once there is text', () => {
		const plugin = placeholderPlugin('Start writing');
		const marked = (doc: Node) => {
			const state = EditorState.create({ doc, plugins: [plugin] });
			return (plugin.props.decorations!.call(plugin, state) as DecorationSet | undefined)?.find().length ?? 0;
		};
		expect(marked(schema.node('doc', null, [schema.node('paragraph')]))).toBe(1);
		expect(marked(schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hi')])]))).toBe(0);
		expect(marked(schema.node('doc', null, [schema.node('paragraph'), schema.node('paragraph')]))).toBe(0);
	});
});
