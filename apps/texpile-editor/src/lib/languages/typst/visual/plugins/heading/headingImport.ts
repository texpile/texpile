// `= Title` and `#heading(..)[Title]`: a heading, the <label> on its line or the next one its own
import type { SyntaxNode } from '@lezer/common';
import {
	aloneWithLabel,
	callOf,
	childOf,
	children,
	labelGapOf,
	namedKey,
	namedValue,
	readCallArgs,
	type TypstImport,
	type TypstSeg
} from '$lib/languages/typst/visual/core/document';

export function headingMarkup(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } {
	const src = im.src;
	const k = kids[i];
	let j = i + 1;
	if (kids[j]?.name === 'Space' && kids[j + 1]?.name === 'Label') j++;
	const labelNode = kids[j]?.name === 'Label' ? kids[j] : null;
	const marker = childOf(k, 'HeadingMarker');
	const level = Math.max(1, marker ? marker.to - marker.from : 1);
	const markup = childOf(k, 'Markup');
	const content = markup ? im.core.inline(children(markup), src, []) : [];
	const label = labelNode ? src.slice(labelNode.from + 1, labelNode.to - 1) : null;
	const labelGap = labelGapOf(src, k.to, labelNode);
	const heading = im.core.node('heading', { level, numbered: true, label, labelGap }, content);
	return { seg: { blocks: [heading], from: k.from, to: (labelNode ?? k).to }, next: labelNode ? j + 1 : i + 1 };
}

export function headingCallSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } | null {
	const src = im.src;
	const hash = kids[i];
	const call = kids[i + 1];
	const list = call ? callOf(call, src, 'heading') : null;
	if (!list) return null;
	const found: { level: number; numbered: boolean; sized: boolean; body: SyntaxNode | null } = {
		level: 1,
		numbered: true,
		sized: false,
		body: null
	};
	const read = readCallArgs(list, src, (item) => {
		if (item.name !== 'Named') {
			if (found.body || (item.name !== 'ContentBlock' && item.name !== 'Str')) return null;
			found.body = item;
			return { role: 'body', text: '', string: item.name === 'Str' };
		}
		const key = namedKey(item, src);
		const value = namedValue(item);
		if (!value) return null;
		if ((key === 'level' || key === 'depth') && !found.sized && value.name === 'Int') {
			found.sized = true;
			found.level = Math.max(1, parseInt(src.slice(value.from, value.to), 10) || 1);
			return { role: 'level', text: src.slice(item.from, value.from) };
		}
		if (key === 'numbering' && value.name === 'None') found.numbered = false;
		return { role: key === 'numbering' && value.name === 'None' ? 'unnumbered' : 'arg', text: src.slice(item.from, item.to) };
	});
	if (!read || read.after.length > (found.body ? 0 : 1)) return null;
	const body = found.body ?? read.after[0];
	const alone = aloneWithLabel(kids, i + 2, src);
	if (!body || !alone) return null;
	const label = alone.label ? src.slice(alone.label.from + 1, alone.label.to - 1) : null;
	const markup = body.name === 'ContentBlock' ? childOf(body, 'Markup') : null;
	const content = body.name === 'Str' ? im.core.string(body, src) : markup ? im.core.inline(children(markup), src, []) : [];
	const typCall = { ...read.args, after: read.after.length > 0 };
	const attrs = { level: found.level, numbered: found.numbered, label, labelGap: labelGapOf(src, call.to, alone.label), typCall };
	return { seg: { blocks: [im.core.node('heading', attrs, content)], from: hash.from, to: (alone.label ?? call).to }, next: alone.next };
}
