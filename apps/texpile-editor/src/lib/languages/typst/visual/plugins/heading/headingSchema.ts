// the shared heading as Typst writes it
import type { NodeSpec } from 'prosemirror-model';
import type { TypstSchemaSpec } from '$lib/languages/typst/visual/core/document';

// typst nests headings past six where html stops: a deeper one is an h6 holding its level
const headingDom: Pick<NodeSpec, 'parseDOM' | 'toDOM'> = {
	parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
		tag: `h${level}`,
		getAttrs: (dom: HTMLElement) => ({ level: Number(dom.getAttribute('data-level')) || level })
	})),
	toDOM(node) {
		const level = Number(node.attrs.level);
		const attrs: Record<string, string> = node.attrs.numbered === false ? { 'data-unnumbered': 'true' } : {};
		if (level > 6) attrs['data-level'] = String(level);
		return [`h${Math.min(6, level)}`, attrs, 0];
	}
};

export function headingSchema({ nodes, marks }: TypstSchemaSpec): TypstSchemaSpec {
	const base = nodes.get('heading')!;
	// a trailing <label> attaches to the heading in typst, so it lives on the node.
	// typCall: the #heading(..) call the file wrote it as, its arguments kept as written (callArgs.ts).
	// labelGap: the bytes the source put between a labelled block and its <label> when they held a
	// line end (null = a space, or no label); the serializer writes the label back where it stood
	const attrs = { ...base.attrs, label: { default: null }, typCall: { default: null }, labelGap: { default: null } };
	return { nodes: nodes.update('heading', { ...base, attrs, ...headingDom }), marks };
}
