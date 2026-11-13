// a table as a float, with its caption and number, and back as a table of its own
import type { Node, Schema } from 'prosemirror-model';
import { generateLabel } from '$lib/editor/visual/label';

type Dialect = 'latex' | 'typst';

// LaTeX numbers a table by its caption, so a new float starts with words to type over; Typst numbers it without
export function floatOf(schema: Schema, table: Node, dialect: Dialect): Node {
	const { nodes } = schema;
	const parts =
		dialect === 'latex' ? [nodes.table_caption.create(null, schema.text('Table caption')), table] : [table, nodes.table_caption.create()];
	return nodes.table_wrapper.create({ label: generateLabel('table'), showNotes: false }, parts);
}

// centered, as the float printed it
export function centeredTableOf(schema: Schema, table: Node, dialect: Dialect): Node {
	if (dialect === 'latex') return schema.nodes.environment.create({ name: 'center' }, table);
	return schema.nodes.typ_env.create({ name: 'align', args: 'center', bodyLead: '\n  ', bodyTrail: '\n' }, table);
}
