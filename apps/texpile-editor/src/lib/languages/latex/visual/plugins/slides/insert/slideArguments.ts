// a frame's title and subtitle, and the overlay and options of a frame, a block and a column, where they are left out
import { TextSelection, type Command } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { optionalArgumentOffers, type InsertArgument, type LatexArgumentContext } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

/** a title node put in at `index` of the frame, the caret in it */
function titleAt(type: 'frame_title' | 'frame_subtitle', index: number): (value: string, pos: number) => Command {
	return (_value, pos) => (state, dispatch) => {
		const frame = state.doc.nodeAt(pos);
		if (!frame) return false;
		let at = pos + 1;
		for (let i = 0; i < index; i++) at += frame.child(i).nodeSize;
		const tr = state.tr.insert(at, state.schema.nodes[type].create({ form: 'macro' }));
		dispatch?.(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
		return true;
	};
}

function frameArguments(node: Node, ctx: LatexArgumentContext): InsertArgument[] {
	const spec = ctx.environmentArgs('frame').filter((a) => a.kind !== 'g');
	const hasTitle = node.firstChild?.type.name === 'frame_title';
	const hasSubtitle = node.maybeChild(hasTitle ? 1 : 0)?.type.name === 'frame_subtitle';
	return [
		...(hasTitle ? [] : [{ id: 'frame_title', label: m.insert_argument_frame_title(), asks: false, run: titleAt('frame_title', 0) }]),
		...(hasSubtitle
			? []
			: [
					{ id: 'frame_subtitle', label: m.insert_argument_frame_subtitle(), asks: false, run: titleAt('frame_subtitle', hasTitle ? 1 : 0) }
				]),
		...(node.attrs.form === 'env' ? optionalArgumentOffers(spec, String(node.attrs.options ?? ''), 'options', 'frame') : [])
	];
}

export function slideArguments(node: Node, _pos: number, ctx: LatexArgumentContext): InsertArgument[] {
	if (node.type.name === 'frame') return frameArguments(node, ctx);
	if (node.type.name === 'beamer_block') {
		const spec = ctx.environmentArgs(String(node.attrs.kind)).filter((a) => a.kind === 'd<>');
		return optionalArgumentOffers(spec, String(node.attrs.spec ?? ''), 'spec', 'block');
	}
	if (node.type.name === 'column') {
		const spec = ctx.commandArgs('column').filter((a) => a.kind !== 'm');
		return optionalArgumentOffers(spec, String(node.attrs.options ?? ''), 'options', 'column');
	}
	return [];
}
