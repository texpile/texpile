import { expect, it, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { VisualView } from '$lib/editor/canvas';
import { offerPopover, openPopoverOf } from '$lib/editor/visual/extensions/popoverFocus/atomPopovers';

const schema = new Schema({
	nodes: {
		doc: { content: 'paragraph+' },
		paragraph: { content: 'inline*' },
		text: { group: 'inline' },
		chip: { group: 'inline', inline: true, atom: true }
	}
});
const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('a'), schema.node('chip')])]);
const view = { state: EditorState.create({ doc }) } as unknown as VisualView;

it('opens the popover offered for the type of the node at the position', () => {
	const open = vi.fn();
	offerPopover('chip', open);
	expect(openPopoverOf(view, 2)).toBe(true);
	expect(open).toHaveBeenCalledWith(view, 2);
});

it('says so when the node has no popover', () => {
	expect(openPopoverOf(view, 1)).toBe(false);
});
