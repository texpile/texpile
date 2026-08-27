// The markdown editor's OWN schema. Shared node shapes are picked from the base schema's spec
// LITERALS (single source of truth), markdown-specific deviations are declared HERE as
// overrides — the base itself stays untouched:
//   - raw_latex / inline_latex carry `lang` ('latex' | 'html' | 'markdown') for the raw islands
//   - an `s` (strikethrough) mark for ~~text~~
// A separate Schema object keeps the editors fully independent: an md doc physically cannot
// contain a citation/environment/includedoc node, and md UI can never dispatch tex mark types.
// Nodes/marks from different Schema objects must never mix in one document.
import { updateImageNode, type SchemaImageSettings } from '$lib/editor/visual/extensions/image/updateImageNode';
import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model';
import { baseNodes, baseMarks } from '$lib/editor/visual/schema/basePMSchema';

// mirrors schema.ts: built by hand because the imageplugin.svelte settings creators pull in the DOM (fatal for
// the parser worker), and the image node must stay a block figure
const schemaImageSettings: SchemaImageSettings = {
	hasTitle: true,
	isBlock: true,
	extraAttributes: { width: null, height: null, maxWidth: null }
};

// everything markdown can express, nothing it can't
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

// overrides build NEW spec objects — mutating the imported literals would leak into every dialect
// a code block created without attrs (shared toolbar button, keybind) must be a FENCE here, not
// tex's verbatim: fences take an info string, so the language picker works on every md block
// base attrs first: ORIG_BLOCKS (baseNodes.ts) adds `orig` to code_block, and replacing attrs
// wholesale dropped it, so a fence never counted as pristine and always regenerated
nodes.code_block = {
	...base.code_block,
	attrs: { ...base.code_block.attrs, lang: { default: '' }, env: { default: 'fence' }, args: { default: '' } }
};
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

const marks: Record<string, MarkSpec> = {};
for (const name of MD_MARKS) marks[name] = (baseMarks as Record<string, MarkSpec>)[name];
marks.s = {
	parseDOM: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
	toDOM() {
		return ['s', 0];
	}
} as MarkSpec;

// two-pass, same as latexPMSchema.ts: updateImageNode needs the node present in an OrderedMap first
const tempschema = new Schema({ nodes, marks });
const imageNodes = updateImageNode(tempschema.spec.nodes, schemaImageSettings);

// `![alt](src "title")` has no figure numbering and no \label, but the shared image spec defaults
// numbered=true — and the insert paths create images on the schema default, so a dropped image
// would render the "Figure N:" caption prefix and offer the LaTeX reference-label field. Patched
// after updateImageNode because that call rebuilds attrs wholesale, and not via extraAttributes
// because it coerces a false default to null (`extraAttributes[k] || null`), which the
// figure-counter CSS reads as "numbered".
const imageSpec = imageNodes.get('image') as NodeSpec;
export const mdSchema = new Schema({
	nodes: imageNodes.update('image', { ...imageSpec, attrs: { ...imageSpec.attrs, numbered: { default: false } } }),
	marks
});
