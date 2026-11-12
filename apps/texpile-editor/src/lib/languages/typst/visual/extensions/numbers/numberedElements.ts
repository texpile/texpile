// the elements of the open file that Typst numbers, in document order, with what tells them apart from the others
import type { Node as PMNode } from 'prosemirror-model';
import { typstChipCounts } from '../../core/plugin/chipCounts';
import type { NumberedElement } from './matchPrinted';

/** `slot` is the footnote's place in its chip */
export type FoundElement = NumberedElement & { pos: number; slot: number };

type ArgItems = { items?: { role: string; text: string }[] } | null;

// words only: math and markup chips in a title have no plain text of their own
function plainText(node: PMNode | null | undefined): string {
	let out = '';
	node?.descendants((n) => {
		if (n.isText) out += n.text;
		return false;
	});
	return out;
}

function namedArg(args: unknown, name: string): string | null {
	for (const item of (args as ArgItems)?.items ?? []) {
		if (item.role !== 'arg') continue;
		const found = new RegExp(`^${name}\\s*:\\s*([^]*?),?$`).exec(item.text.trim());
		if (found) return found[1].trim();
	}
	return null;
}

/** what the figure's `supplement:` writes as a string or a plain content block, '' when it writes none */
export function figureSupplement(args: unknown): string {
	const value = namedArg(args, 'supplement');
	return value
		? (/^(?:"([^"\\]*)"|\[([^[\]\\]*)\])$/
				.exec(value)
				?.slice(1)
				.find((v) => v !== undefined) ?? '')
		: '';
}

// null: the document does not say, as for a figure of `kind: some-variable`
function figureKindOf(node: PMNode): string | null {
	const named = namedArg(node.attrs.typFigure, 'kind');
	if (named !== null) return /^"([^"\\]*)"$/.exec(named)?.[1] ?? (/^(?:image|table|raw)$/.test(named) ? named : null);
	const name = node.type.name;
	if (name === 'image') return 'image';
	if (name === 'table_wrapper') return 'table';
	return node.firstChild?.type.name === 'code_block' ? 'raw' : null;
}

function figureCaption(node: PMNode): string {
	if (node.type.name === 'image') return plainText(node);
	const caption = node.type.name === 'table_wrapper' ? node.firstChild : node.lastChild;
	return caption && /caption$/.test(caption.type.name) ? plainText(caption) : '';
}

export function numberedElementsOf(doc: PMNode): FoundElement[] {
	const found: FoundElement[] = [];
	doc.descendants((node, pos) => {
		const name = node.type.name;
		const label = typeof node.attrs.label === 'string' && node.attrs.label ? node.attrs.label : null;
		if (name === 'heading') found.push({ kind: 'heading', pos, slot: 0, label, text: plainText(node), level: Number(node.attrs.level) });
		else if (name === 'block_math') found.push({ kind: 'equation', pos, slot: 0, label, text: '' });
		else if (name === 'table_wrapper' || name === 'typ_figure' || (name === 'image' && node.attrs.numbered === true))
			found.push({ kind: 'figure', pos, slot: 0, label, text: figureCaption(node), figureKind: figureKindOf(node) });
		else if (name === 'includedoc') found.push({ kind: 'include', pos, slot: 0, label: null, text: '' });
		else if (name === 'inline_latex' || name === 'raw_latex') {
			const source = node.textContent;
			const notes = typstChipCounts(source).footnote?.length ?? 0;
			for (let slot = 0; slot < notes; slot++) found.push({ kind: 'footnote', pos, slot, label: null, text: '' });
			if (source.includes('include')) found.push({ kind: 'include', pos, slot: 0, label: null, text: '' });
			return false;
		}
		return true;
	});
	return found;
}
