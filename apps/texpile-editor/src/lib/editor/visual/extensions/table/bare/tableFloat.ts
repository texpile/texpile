// a table as a float, with its caption and number, and back as a table of its own
import type { Node, Schema } from 'prosemirror-model';
import { generateLabel } from '$lib/editor/visual/label';

type Dialect = 'latex' | 'typst';

// LaTeX numbers a table by its caption, so a new float starts with words to type over; Typst numbers it without
// `before`: the commands that stood before the table in its block, which a LaTeX float keeps before its table
export function floatOf(schema: Schema, table: Node, dialect: Dialect, before = ''): Node {
	const { nodes } = schema;
	const parts =
		dialect === 'latex' ? [nodes.table_caption.create(null, schema.text('Table caption')), table] : [table, nodes.table_caption.create()];
	return nodes.table_wrapper.create({ label: generateLabel('table'), showNotes: false, preBody: before || null }, parts);
}

// centered, as the float printed it, after the commands the float kept before its table
export function centeredTableOf(schema: Schema, table: Node, dialect: Dialect, before = ''): Node {
	const { nodes } = schema;
	if (dialect !== 'latex') return nodes.typ_env.create({ name: 'align', args: 'center', bodyLead: '\n  ', bodyTrail: '\n' }, table);
	const commands = before ? [nodes.paragraph.create(null, nodes.inline_latex.create(null, schema.text(before)))] : [];
	return nodes.environment.create({ name: 'center' }, [...commands, table]);
}
