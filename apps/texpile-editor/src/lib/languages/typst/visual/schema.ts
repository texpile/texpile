// The Typst visual editor's OWN schema, built the mdSchema way: shared node shapes are picked
// from the base schema's spec LITERALS (single source of truth), Typst-specific deviations are
// declared HERE as overrides. A separate Schema object keeps the editors fully independent — a
// Typst doc physically cannot contain a citation/environment node, and Typst UI can never
// dispatch tex-only mark types. Nodes/marks from different Schema objects must never mix in one
// document.
//
// Deliberately DOM-import-free beyond prosemirror-model: the parse worker loads this module.
import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model';
import { baseNodes, baseMarks } from '$lib/editor/visual/schema/basePMSchema';
import { typstDocumentPlugins } from './typstDocumentPlugins';

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
// typFile: what the bytes outside the markup looked like (a leading BOM, CRLF line endings)
nodes.doc = { ...base.doc, attrs: { ...base.doc.attrs, typFile: { default: null } } };

// `#theorem[...]`, `#align(center)[...]`: a call whose last argument is the content block it
// wraps, standing on its own lines. name is the callee and args the bytes between its
// parentheses (null: it had none), both verbatim; bodyLead/bodyTrail are the whitespace inside
// the brackets around the body (null: editor-made, which opens the body on a line of its own),
// and typIndent the width the call's line stood at, which a container holding it writes itself.
// typBodyArg: the body was the call's last argument (`#align(center, table(..))`, envConvert.ts BodyArg); code: it was code
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
		typIndent: { default: null },
		typBodyArg: { default: null },
		code: { default: false }
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

const marks: Record<string, MarkSpec> = {};
for (const name of TYP_MARKS) marks[name] = (baseMarks as Record<string, MarkSpec>)[name];
const core = new Schema({ nodes, marks }).spec;
const spec = typstDocumentPlugins.reduce((was, plugin) => plugin.schema?.(was) ?? was, { nodes: core.nodes, marks: core.marks });

// typGap: how the source separated this block from the one before it, 'newline' or 'blank'
// (null = editor-created, the serializer picks a default per pair). in typst a single newline
// keeps `Text.\n#set text(red)\nMore.` one paragraph and `- a\n  - b` a tight nest, so the
// serializer has to know which it was. image gets it through the image plugin's extraAttributes; the
// flat-list spec's group is "flatList block", so the group is split rather than compared whole
let gapped = spec.nodes;
spec.nodes.forEach((name, node) => {
	const isBlock = (node.group ?? '').split(/\s+/).includes('block');
	if (isBlock && name !== 'image') gapped = gapped.update(name, { ...node, attrs: { ...node.attrs, typGap: { default: null } } });
});

function widened(name: string, attrs: NodeSpec['attrs']): NodeSpec {
	const node = gapped.get(name)!;
	return { ...node, attrs: { ...node.attrs, ...attrs } };
}

// typExpr: a body the file wrote as code (a string, an equation, a call), written back as one expression
gapped = gapped.update('paragraph', widened('paragraph', { typExpr: { default: false } }));

export const typSchema = new Schema({ nodes: gapped, marks: spec.marks });
