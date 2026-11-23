// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

const open = vi.hoisted(() => vi.fn());
vi.mock('$lib/languages/latex/visual/core', () => ({ settingsPanelOffer: () => ({ open }), offerPopover: vi.fn() }));
vi.mock('$lib/languages/latex/visual/plugins/citation/node/CitationPopover.svelte', () => ({ default: {} }));

import { citationKeys } from '$lib/languages/latex/visual/plugins/citation/citationForm';

const doc = schema.node('doc', null, [
	schema.node('paragraph', null, [schema.text('a '), schema.nodes.citation.create({ variant: 'cite' }, schema.text('k'))])
]);
const enter = (selection: (d: typeof doc) => NodeSelection | TextSelection) => {
	const state = EditorState.create({ doc });
	let at = state.apply(state.tr.setSelection(selection(doc)));
	const view = {
		get state() {
			return at;
		},
		dispatch: (tr: typeof at.tr) => void (at = at.apply(tr)),
		nodeDOM: () => ({ getBoundingClientRect: () => new DOMRect() })
	} as unknown as EditorView;
	const plugin = citationKeys()[0];
	return plugin.props.handleKeyDown!.call(plugin, view, new KeyboardEvent('keydown', { key: 'Enter' }));
};

it('opens the form on Enter over a selected citation', () => {
	expect(enter((d) => NodeSelection.create(d, 3))).toBe(true);
	expect(open).toHaveBeenCalledOnce();
});

it('leaves Enter in text alone', () => {
	open.mockClear();
	expect(enter((d) => TextSelection.create(d, 2))).toBe(false);
	expect(open).not.toHaveBeenCalled();
});
