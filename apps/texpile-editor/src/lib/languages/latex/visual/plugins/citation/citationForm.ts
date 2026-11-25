import type { Component } from 'svelte';
import { NodeSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import type { Plugin } from 'prosemirror-state';
import type { ViewElementRef, VisualView } from '$lib/editor/canvas';
import { offerPopover, settingsPanelOffer, type PanelProps } from '$lib/languages/latex/visual/core';
import CitationPopover from './node/CitationPopover.svelte';

type CitationPanelProps = PanelProps & {
	onUpdate: (attrs: Record<string, unknown>) => void;
	onChangeKey: (key: string) => void;
};

const form = settingsPanelOffer<CitationPanelProps>({
	nodeType: 'citation',
	label: () => '',
	component: CitationPopover as unknown as Component<CitationPanelProps>,
	opener: 'openAt',
	props: (block) => ({
		view: block.view,
		getPos: block.getPos,
		get node() {
			return block.node;
		},
		onUpdate(attrs) {
			const pos = block.getPos();
			if (pos !== undefined) block.view.dispatch(block.view.state.tr.setNodeMarkup(pos, null, { ...block.node.attrs, ...attrs }));
		},
		// the key is the node's text, so a new key is a new node
		onChangeKey(key) {
			const pos = block.getPos();
			if (pos === undefined) return;
			const { node, view } = block;
			const text = key ? view.state.schema.text(key) : null;
			const { selection } = view.state;
			const selected = selection instanceof NodeSelection && selection.from === pos;
			const tr = view.state.tr.replaceWith(pos, pos + node.nodeSize, node.type.create(node.attrs, text));
			view.dispatch(selected ? tr.setSelection(NodeSelection.create(tr.doc, pos)) : tr);
		}
	})
});

export function openCitationForm(view: VisualView, pos: number): void {
	const box = (view.nodeDOM(pos) as ViewElementRef | null)?.getBoundingClientRect();
	if (box) form.open(pos, view, box);
}

offerPopover('citation', openCitationForm);

function openSelectedCitation(state: EditorState, _dispatch?: unknown, view?: EditorView): boolean {
	const { selection } = state;
	if (!view || !(selection instanceof NodeSelection) || selection.node.type.name !== 'citation') return false;
	openCitationForm(view as unknown as VisualView, selection.from);
	return true;
}

export function citationKeys(): Plugin[] {
	return [keymap({ Enter: openSelectedCitation })];
}
