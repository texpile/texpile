import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model';
import { baseNodes, baseMarks } from '$lib/editor/visual/schema/basePMSchema';
import { markdownPlugins } from './markdownPlugins';

const MD_NODES = [
	'doc',
	'paragraph',
	'blockquote',
	'horizontal_rule',
	'heading',
	'code_block',
	'raw_latex',
	'inline_latex',
	'block_math',
	'inline_math',
	'text',
	'hard_break',
	'image',
	'list',
	'table',
	'table_row',
	'table_cell',
	'table_header'
] as const;

const MD_MARKS = ['link', 'em', 'strong', 'code'] as const;

const base = baseNodes as Record<string, NodeSpec>;
const nodes: Record<string, NodeSpec> = {};
for (const name of MD_NODES) nodes[name] = base[name];

// overrides build NEW spec objects: mutating the imported literals would leak into every dialect
nodes.raw_latex = {
	...base.raw_latex,
	attrs: { ...base.raw_latex.attrs, lang: { default: 'latex' } }
};
nodes.inline_latex = {
	...base.inline_latex,
	attrs: { ...base.inline_latex.attrs, lang: { default: 'latex' } },
	toDOM: (node) => {
		const lang = String(node.attrs.lang ?? 'latex');
		const label = lang === 'html' ? 'Raw HTML' : lang === 'markdown' ? 'Raw Markdown' : 'Raw LaTeX';
		return ['code', { class: 'inline-latex', title: `${label} (passed through unchanged)` }, 0];
	}
};
// the file's line ending, so regenerated blocks match the untouched ones
nodes.doc = { ...base.doc, attrs: { ...base.doc.attrs, eol: { default: null } } };

const marks: Record<string, MarkSpec> = {};
for (const name of MD_MARKS) marks[name] = (baseMarks as Record<string, MarkSpec>)[name];

const core = new Schema({ nodes, marks }).spec;
const spec = markdownPlugins.reduce((was, plugin) => plugin.schema?.(was) ?? was, { nodes: core.nodes, marks: core.marks });

export const mdSchema = new Schema({ nodes: spec.nodes, marks: spec.marks });
