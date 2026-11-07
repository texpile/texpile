// the shared table nodes as Typst writes them: the arguments and rules a #table(..) keeps verbatim
import type { NodeSpec } from 'prosemirror-model';
import type { TypstSchemaSpec } from '$lib/languages/typst/visual/core/document';

function widen(spec: NodeSpec, attrs: NodeSpec['attrs']): NodeSpec {
	return { ...spec, attrs: { ...spec.attrs, ...attrs } };
}

export function tableSchema({ nodes, marks }: TypstSchemaSpec): TypstSchemaSpec {
	const widened: Record<string, NodeSpec['attrs']> = {
		table: { typAlign: { default: null }, typArgs: { default: [] }, typBottomRules: { default: [] } },
		table_row: { typRules: { default: [] } },
		// typCode: the cell was a bare expression (`text("0")`), written back without brackets while it is that one chip still;
		// typCellArgs: a table.cell's named arguments other than its spans, verbatim
		table_cell: { typCode: { default: false }, typCellArgs: { default: [] } },
		table_header: { typCode: { default: false }, typCellArgs: { default: [] } },
		// labelGap: the bytes the source put between a labelled block and its <label> when they held a
		// line end (null = a space, or no label); the serializer writes the label back where it stood.
		// typCaption: the file gave the figure a caption, which stays when its text is empty: typst still draws "Table 1:"
		table_wrapper: {
			labelGap: { default: null },
			typCaption: { default: false },
			typFigure: { default: null },
			typIndent: { default: null }
		},
		table_caption: { typString: { default: false } }
	};
	let out = nodes;
	for (const [name, attrs] of Object.entries(widened)) out = out.update(name, widen(out.get(name)!, attrs));
	return { nodes: out, marks };
}
