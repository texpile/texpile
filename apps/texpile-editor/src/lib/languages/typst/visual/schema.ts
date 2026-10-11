// The Typst visual editor's OWN schema, built the mdSchema way: shared node shapes are picked
// from the base schema's spec LITERALS (single source of truth), Typst-specific deviations are
// declared HERE as overrides. A separate Schema object keeps the editors fully independent — a
// Typst doc physically cannot contain a citation/environment node, and Typst UI can never
// dispatch tex-only mark types. Nodes/marks from different Schema objects must never mix in one
// document.
//
// Deliberately DOM-import-free beyond prosemirror-model: the parse worker loads this module.
import { updateImageNode, type SchemaImageSettings } from '$lib/editor/visual/extensions/image/updateImageNode';
import { Schema, type NodeSpec, type MarkSpec, type Node as PMNode } from 'prosemirror-model';
import { baseNodes, baseMarks, callMark } from '$lib/editor/visual/schema/basePMSchema';

// mirrors mdSchema: built by hand because the imageplugin.svelte settings creators pull in the DOM (fatal for a
// worker), and the image node must stay a block figure
const schemaImageSettings: SchemaImageSettings = {
	hasTitle: true,
	isBlock: true,
	extraAttributes: { width: null, height: null, maxWidth: null, typGap: null, labelGap: null }
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
// Spread the base attrs first: replacing them wholesale silently drops the ones the shared
// extensions read.
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
// math nodes hold the equation's Typst, which MathLive reads and writes as Typst; their HTML says
// so, for a paste into a LaTeX document to rewrite it (see pastedMath.ts)
nodes.inline_math = {
	...base.inline_math,
	mathSyntax: 'typst',
	toDOM: () => ['span', { class: 'inline-math', 'data-math-syntax': 'typst' }, 0]
};
nodes.block_math = {
	...base.block_math,
	mathSyntax: 'typst',
	toDOM: (node: PMNode) => ['div', { class: 'block-math', 'data-label': node.attrs.label, 'data-math-syntax': 'typst' }, 0]
};
// typNumber: the explicit "5." an enum item was written with (null for "+"); order stays the
// display counter flat-list reads
nodes.list = { ...base.list, attrs: { ...base.list.attrs, typNumber: { default: null } } };
// a trailing <label> attaches to the heading in typst, so it lives on the node
nodes.heading = {
	...base.heading,
	attrs: { ...base.heading.attrs, label: { default: null } },
	// typst nests headings past six where html stops: a deeper one is an h6 holding its level
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
// labelGap: the bytes the source put between a labelled block and its <label> when they held a
// line end (null = a space, or no label); the serializer writes the label back where it stood
for (const name of ['heading', 'block_math', 'table_wrapper']) {
	nodes[name] = { ...nodes[name], attrs: { ...nodes[name].attrs, labelGap: { default: null } } };
}
// typCaption: the file gave the figure a caption, which stays when its text is empty: typst still draws "Table 1:"
nodes.table_wrapper = { ...nodes.table_wrapper, attrs: { ...nodes.table_wrapper.attrs, typCaption: { default: false } } };
// typFile: what the bytes outside the markup looked like (a leading BOM, CRLF line endings)
nodes.doc = { ...base.doc, attrs: { ...base.doc.attrs, typFile: { default: null } } };

// Typst-only nodes, declared here the way mdSchema declares its `s` mark: term lists
// (`/ term: description`) have no tex counterpart. The title is its own child textblock so
// both halves are directly editable.
nodes.term_title = {
	content: 'inline*',
	parseDOM: [{ tag: 'div[data-term-title]' }],
	toDOM: () => ['div', { 'data-term-title': '', class: 'term-title' }, 0]
};
// `@target` - one atom for BOTH of typst's meanings (bibliography citation and label
// cross-reference): the serialization is identical either way, so the doc never has to decide.
// The node VIEW resolves the target against the loaded bibliography for display.
//
// supplement: the markup inside `@target[...]` (a citation's page, a reference's word before the
// number), verbatim; null for none, which is not the empty `[]`. form: the `form:` of a
// `#cite(<target>, form: "prose")`, the one spelling that needs the call; null leaves it to the style
nodes.typ_ref = {
	inline: true,
	group: 'inline',
	atom: true,
	selectable: true,
	attrs: { target: {}, supplement: { default: null }, form: { default: null } },
	parseDOM: [
		{
			tag: 'span[data-typ-ref]',
			getAttrs: (dom) => {
				const el = dom as HTMLElement;
				return {
					target: el.getAttribute('data-typ-ref') || '',
					supplement: el.getAttribute('data-supplement'),
					form: el.getAttribute('data-form') || null
				};
			}
		}
	],
	toDOM: (node) => [
		'span',
		{
			'data-typ-ref': String(node.attrs.target),
			'data-supplement': node.attrs.supplement,
			'data-form': node.attrs.form,
			class: 'typ-ref'
		},
		`@${node.attrs.target}`
	],
	leafText: (node) => `@${node.attrs.target}`
};
// `#theorem[...]`, `#align(center)[...]`: a call whose last argument is the content block it
// wraps, standing on its own lines. name is the callee and args the bytes between its
// parentheses (null: it had none), both verbatim; bodyLead/bodyTrail are the whitespace inside
// the brackets around the body (null: editor-made, which opens the body on a line of its own),
// and typIndent the width the call's line stood at, which a container holding it writes itself
nodes.typ_env = {
	content: 'block+',
	group: 'block',
	definingAsContext: true,
	allowGapCursor: true,
	attrs: {
		name: { default: 'block' },
		args: { default: null },
		label: { default: null },
		labelGap: { default: null },
		bodyLead: { default: null },
		bodyTrail: { default: null },
		typIndent: { default: null }
	},
	parseDOM: [
		{
			tag: 'div.typ-environment',
			getAttrs: (dom) => {
				const el = dom as HTMLElement;
				return {
					name: el.getAttribute('data-typ-env') || 'block',
					args: el.getAttribute('data-args'),
					label: el.getAttribute('data-label') || null
				};
			}
		}
	],
	toDOM: (node) => [
		'div',
		{ class: 'typ-environment', 'data-typ-env': node.attrs.name, 'data-args': node.attrs.args, 'data-label': node.attrs.label },
		0
	]
};
nodes.term_item = {
	content: 'term_title block+',
	group: 'block',
	defining: true,
	parseDOM: [{ tag: 'div[data-term-item]' }],
	toDOM: () => ['div', { 'data-term-item': '', class: 'term-item' }, 0]
};

// typGap: how the source separated this block from the one before it, 'newline' or 'blank'
// (null = editor-created, the serializer picks a default per pair). in typst a single newline
// keeps `Text.\n#set text(red)\nMore.` one paragraph and `- a\n  - b` a tight nest, so the
// serializer has to know which it was. image gets it through extraAttributes below; the
// flat-list spec's group is "flatList block", so the group is split rather than compared whole
for (const name of Object.keys(nodes)) {
	const spec = nodes[name];
	const isBlock = (spec.group ?? '').split(/\s+/).includes('block');
	if (isBlock && name !== 'image') nodes[name] = { ...spec, attrs: { ...spec.attrs, typGap: { default: null } } };
}

const marks: Record<string, MarkSpec> = {};
for (const name of TYP_MARKS) marks[name] = (baseMarks as Record<string, MarkSpec>)[name];
marks.call = callMark('typst');

// two-pass, same as latexPMSchema/mdSchema: updateImageNode needs the node present in an OrderedMap
// first. numbered stays true (typst figures number themselves), unlike markdown's false.
const tempschema = new Schema({ nodes, marks });
const imageNodes = updateImageNode(tempschema.spec.nodes, schemaImageSettings);

export const typSchema = new Schema({ nodes: imageNodes, marks });
