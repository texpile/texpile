// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createLinkPlugin } from '$lib/editor/visual/extensions/link/linkPlugin';

vi.mock('$lib/editor/visual/extensions/link/linkTooltipFactory.svelte', () => ({
	createLinkTooltip: () => {},
	destroyLinkTooltip: () => {}
}));

// the links of a block are kept while the block is the same node: one in a later block must still be found where
// it is, and its address must follow its text
it('keeps the address of a link that shows its address in step with typing, in a block after an edited one', () => {
	const link = schema.marks.link.create({ href: 'https://a.example', title: null });
	const doc = schema.node('doc', null, [
		schema.node('paragraph', null, [schema.text('one')]),
		schema.node('paragraph', null, [schema.text('at '), schema.text('https://a.example', [link])])
	]);
	let state = EditorState.create({ doc, plugins: [createLinkPlugin()] });
	state = state.apply(state.tr.insertText('xy', 2));
	state = state.apply(state.tr.insertText('s', state.doc.content.size - 9));
	const hrefs: string[] = [];
	state.doc.descendants((node) => {
		for (const mark of node.marks) if (mark.type === schema.marks.link) hrefs.push(`${node.text} -> ${mark.attrs.href}`);
	});
	expect(hrefs).toEqual(['https://as.example -> https://as.example']);
});
