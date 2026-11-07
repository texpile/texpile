// The markdown editor's OWN schema. Shared node shapes are picked from the base schema's spec LITERALS (single source
// of truth), markdown-specific deviations are declared HERE (the core's nodes) or by the plugin that owns the element.
// A separate Schema object keeps the editors fully independent: an md doc physically cannot contain a citation or
// environment node, and md UI can never dispatch tex mark types. Nodes/marks from different Schema objects must never
// mix in one document.
import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model';
import { baseNodes, baseMarks } from '$lib/editor/visual/schema/basePMSchema';
import { markdownPlugins } from './markdownPlugins';

// everything markdown can express, nothing it can't; the order is ProseMirror's defaults
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
// raw_latex / inline_latex carry `lang` ('latex' | 'html' | 'markdown') for the raw islands; base attrs first, so a dialect override never drops one the shared extensions read
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

// the core's nodes, then each plugin's in list order
const core = new Schema({ nodes, marks }).spec;
const spec = markdownPlugins.reduce((was, plugin) => plugin.schema?.(was) ?? was, { nodes: core.nodes, marks: core.marks });

export const mdSchema = new Schema({ nodes: spec.nodes, marks: spec.marks });
