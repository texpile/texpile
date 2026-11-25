// `@target` drawn as TypstRefDisplay drew it: the reference as it will read, in the reference color or red when nothing
// answers to it; a click opens its citation form
import type { Node as PMNode } from 'prosemirror-model';
import type { Component } from 'svelte';
import type { CanvasNodeViewConstructor, StyleLook, ViewElementRef } from '$lib/editor/canvas';
import { caretToChip, setLook } from '$lib/editor/canvas';
import { isReadOnly, referenceStore, settingsPanelOffer, type PanelProps } from '$lib/languages/typst/visual/core';
import TypstRefPopover from './TypstRefPopover.svelte';
import { refNumbersOf } from './refNumbers.svelte';
import { typstRefFace } from './typstRefFace';

const KNOWN: StyleLook = { borderRadius: 'var(--radius-base)', cursor: 'pointer', color: 'var(--color-ref-fg)' };
const LABEL: StyleLook = { paddingTop: '0.125rem', paddingBottom: '0.125rem', marginTop: '-0.125rem', marginBottom: '-0.125rem' };
const UNKNOWN: StyleLook = { ...KNOWN, color: 'var(--color-ref-broken-fg)' };

type RefPanelProps = PanelProps & {
	parse: (source: string) => PMNode;
	onUpdate: (attrs: Record<string, unknown>) => void;
	onChangeKey: (key: string) => void;
};

function refForm(parse: (source: string) => PMNode) {
	return settingsPanelOffer<RefPanelProps>({
		nodeType: 'typ_ref',
		label: () => '',
		component: TypstRefPopover as unknown as Component<RefPanelProps>,
		opener: 'open',
		props: (block) => {
			function updateAttrs(attrs: Record<string, unknown>): void {
				const pos = block.getPos();
				if (pos !== undefined) block.view.dispatch(block.view.state.tr.setNodeMarkup(pos, null, { ...block.node.attrs, ...attrs }));
			}
			return {
				view: block.view,
				getPos: block.getPos,
				get node() {
					return block.node;
				},
				parse,
				onUpdate: updateAttrs,
				onChangeKey: (key) => updateAttrs({ target: key })
			};
		}
	});
}

export function typstRefCanvasView(parse: (source: string) => PMNode): CanvasNodeViewConstructor {
	const form = refForm(parse);
	return (node, view, getPos) => {
		const { el, read } = view.canvas.build;
		// the bibliography loads after the doc first draws; the reference upgrades from @key when it lands
		const face = read({ kind: 'store', name: 'typstNames' }, () =>
			typstRefFace(node.attrs, referenceStore.current, refNumbersOf(view).labels)
		);
		const dom = el('span', 'typ-ref', face.text);
		setLook(dom, face.known ? (face.kind === 'label' ? { ...KNOWN, ...LABEL } : KNOWN) : UNKNOWN);
		dom.states = { hover: { backgroundColor: face.known ? 'var(--color-ref-bg)' : 'var(--color-ref-broken-bg)' } };
		dom.hint = face.title;
		dom.on.click = () => {
			const pos = getPos();
			const box = pos === undefined ? null : (view.nodeDOM(pos) as ViewElementRef | null)?.getBoundingClientRect();
			if (pos === undefined || !box || isReadOnly.current) return true;
			caretToChip(view, pos);
			form.open(pos, view, box);
			return true;
		};
		const drawn = JSON.stringify(face);
		return {
			dom,
			update: (next) =>
				next.type === node.type && JSON.stringify(typstRefFace(next.attrs, referenceStore.current, refNumbersOf(view).labels)) === drawn
		};
	};
}
