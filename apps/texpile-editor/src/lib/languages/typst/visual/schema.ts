// The Typst visual editor's OWN schema, built the mdSchema way: shared node shapes are picked
// from the base schema's spec LITERALS (single source of truth), Typst-specific deviations are
// declared HERE as overrides. A separate Schema object keeps the editors fully independent — a
// Typst doc physically cannot contain a citation/environment node, and Typst UI can never
// dispatch tex-only mark types. Nodes/marks from different Schema objects must never mix in one
// document.
//
// Deliberately DOM-import-free beyond prosemirror-model: the parse worker loads this module.
import { updateImageNode, type SchemaImageSettings } from '$lib/editor/visual/extensions/image/updateImageNode';
import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model';
import { baseNodes, baseMarks } from '$lib/editor/visual/schema/basePMSchema';

// mirrors mdSchema: built by hand because the imageplugin.svelte settings creators pull in the DOM (fatal for a
// worker), and the image node must stay a block figure
const schemaImageSettings: SchemaImageSettings = {
	hasTitle: true,
	isBlock: true,
	extraAttributes: { width: null, height: null, maxWidth: null }
};

// everything the converter can emit, nothing more. Tables and real math nodes arrive with their
// dedicated converters/views; until then those constructs live in raw islands.
const TYP_NODES = [
	'doc',
	'paragraph',
	'heading',
	'horizontal_rule',
	'code_block',
	'raw_latex',
	'inline_latex',
	'text',
	'hard_break',
	'list',
	'blockquote',
	'inline_math',
	'block_math',
	'includedoc',
	'image',
	'table',
	'table_row',
	'table_cell',
	'table_header',
	// #figure(table(...), caption: [...]) - caption + table + (never-emitted) notes; the notes
	// spec rides along only because the wrapper's content expression names it
	'table_wrapper',
	'table_caption',
	'table_notes'
] as const;

// u/sup/sub/textcolor/highlight round-trip to #underline / #super / #sub / #text(fill:) /
// #highlight - the plain one-content-argument forms; anything fancier stays a raw chip
const TYP_MARKS = ['link', 'em', 'strong', 'code', 'u', 'sup', 'sub', 'textcolor', 'highlight'] as const;

const base = baseNodes as Record<string, NodeSpec>;
const nodes: Record<string, NodeSpec> = {};
for (const name of TYP_NODES) nodes[name] = base[name];

// overrides build NEW spec objects — mutating the imported literals would leak into every dialect
// a code block created without attrs (shared toolbar button, keybind) must be a FENCE here, not
// tex's verbatim: typst raw fences take an info string, so the language picker works everywhere
// Spread the base attrs first. ORIG_BLOCKS (baseNodes.ts) adds `orig` to code_block's spec, and
// replacing attrs wholesale silently dropped it - so a fence could never be recognised as pristine
// and always regenerated, which forced a blank line between it and its neighbour. `#set page(..)`
// directly above a ```` fence came back with a blank line inserted on every save.
nodes.code_block = {
	...base.code_block,
	attrs: { ...base.code_block.attrs, lang: { default: '' }, env: { default: 'fence' }, args: { default: '' } }
};
// the raw islands carry Typst source, not LaTeX; `lang` follows mdSchema's precedent
nodes.raw_latex = {
	...base.raw_latex,
	attrs: { ...base.raw_latex.attrs, lang: { default: 'typst' } }
};
nodes.inline_latex = {
	...base.inline_latex,
	attrs: { ...base.inline_latex.attrs, lang: { default: 'typst' } },
	toDOM: () => ['code', { class: 'inline-latex', title: 'Raw Typst (passed through unchanged)' }, 0]
};
// the verbatim align: argument, kept the way colspec keeps columns:
//
// typArgs holds every OTHER named argument (stroke:, fill:, gutter:, inset:) verbatim and in
// source order. They are what used to force a whole table into a raw island: the grid model has
// no field for them, but it does not need one to carry them across a round trip untouched.
// typBottomRules is the run of table.hline() calls after the last row, the sibling of the
// per-row typRules below (base.table's bottomRules holds LaTeX text, so Typst needs its own).
nodes.table = {
	...base.table,
	attrs: { ...base.table.attrs, typAlign: { default: null }, typArgs: { default: [] }, typBottomRules: { default: [] } }
};
// the table.hline() calls sitting immediately above this row, verbatim. Same split as above:
// base.table_row's topRules carries \hline / \cline text and belongs to the LaTeX serializer
nodes.table_row = {
	...base.table_row,
	attrs: { ...base.table_row.attrs, typRules: { default: [] } }
};
// math nodes hold LATEX content (what MathLive edits); `typst` is the original source and
// `latexOrig` its parse-time translation - while they agree, the serializer re-emits `typst`
// byte-for-byte and MathLive is never consulted
const mathAttrs = { typst: { default: null }, latexOrig: { default: null } };
nodes.inline_math = { ...base.inline_math, attrs: { ...base.inline_math.attrs, ...mathAttrs } };
nodes.block_math = { ...base.block_math, attrs: { ...base.block_math.attrs, ...mathAttrs } };

// Typst-only nodes, declared here the way mdSchema declares its `s` mark: term lists
// (`/ term: description`) have no tex counterpart. The title is its own child textblock so
// both halves are directly editable; orig is added by hand since the tex ORIG_BLOCKS loop
// never saw this spec.
nodes.term_title = {
	content: 'inline*',
	parseDOM: [{ tag: 'div[data-term-title]' }],
	toDOM: () => ['div', { 'data-term-title': '', class: 'term-title' }, 0]
};
// `@target` - one atom for BOTH of typst's meanings (bibliography citation and label
// cross-reference): the serialization is identical either way, so the doc never has to decide.
// The node VIEW resolves the target against the loaded bibliography for display.
nodes.typ_ref = {
	inline: true,
	group: 'inline',
	atom: true,
	selectable: true,
	attrs: { target: {} },
	parseDOM: [
		{
			tag: 'span[data-typ-ref]',
			getAttrs: (dom) => ({ target: (dom as HTMLElement).getAttribute('data-typ-ref') || '' })
		}
	],
	toDOM: (node) => ['span', { 'data-typ-ref': String(node.attrs.target), class: 'typ-ref' }, `@${node.attrs.target}`],
	leafText: (node) => `@${node.attrs.target}`
};
nodes.term_item = {
	content: 'term_title block+',
	group: 'block',
	defining: true,
	attrs: { orig: { default: null } },
	parseDOM: [{ tag: 'div[data-term-item]' }],
	toDOM: () => ['div', { 'data-term-item': '', class: 'term-item' }, 0]
};

const marks: Record<string, MarkSpec> = {};
for (const name of TYP_MARKS) marks[name] = (baseMarks as Record<string, MarkSpec>)[name];

// two-pass, same as latexPMSchema/mdSchema: updateImageNode needs the node present in an OrderedMap
// first. numbered stays true (typst figures number themselves), unlike markdown's false.
const tempschema = new Schema({ nodes, marks });
const imageNodes = updateImageNode(tempschema.spec.nodes, schemaImageSettings);

export const typSchema = new Schema({ nodes: imageNodes, marks });
