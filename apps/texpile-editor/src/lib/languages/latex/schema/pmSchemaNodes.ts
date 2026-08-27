import { citationNodeSpec } from '$lib/languages/latex/visual/extensions/citation/citationSchema';
import { refNodeSpec } from '$lib/languages/latex/visual/extensions/ref/refSchema';
import { labelNodeSpec } from '$lib/languages/latex/visual/extensions/label/labelSchema';
import { createListSpec } from 'prosemirror-flat-list';
import { imageNodes, tableFamilyNodes } from './pmSchemaFloatNodes';
import type { NodeSpec, DOMOutputSpec } from 'prosemirror-model';

const pDom: DOMOutputSpec = ['p', 0],
	blockquoteDom: DOMOutputSpec = ['blockquote', { class: 'blockquote' }, 0],
	hrDom: DOMOutputSpec = ['hr'],
	preDom: DOMOutputSpec = ['pre', ['code', 0]],
	brDom: DOMOutputSpec = ['br'];

export const nodes = {
	doc: {
		content: 'block+',
		// the body's trailing gap (blank lines before \end{document}) belongs to no block node.
		// { text, afterSeq }: re-emitted verbatim iff the doc still ends with that pristine block
		attrs: { docTail: { default: null } }
	} as NodeSpec,
	paragraph: {
		content: 'inline*',
		group: 'block',
		// 'auto' (no command), 'indent' (\indent), 'noindent' (\noindent)
		attrs: { indent: { default: 'auto' } },
		parseDOM: [{ tag: 'p', getAttrs: (dom) => ({ indent: (dom as HTMLElement).getAttribute('data-indent') || 'auto' }) }],
		toDOM(node) {
			return node.attrs.indent !== 'auto' ? ['p', { 'data-indent': node.attrs.indent }, 0] : pDom;
		}
	} as NodeSpec,

	blockquote: {
		content: 'block+',
		group: 'block',
		defining: true,
		parseDOM: [{ tag: 'blockquote' }],
		toDOM() {
			return blockquoteDom;
		}
	} as NodeSpec,

	horizontal_rule: {
		group: 'block',
		parseDOM: [{ tag: 'hr' }],
		toDOM() {
			return hrDom;
		}
	} as NodeSpec,

	// level 1-3 maps to \section / \subsection / \subsubsection; numbered=false is the starred form
	heading: {
		attrs: { level: { default: 1 }, numbered: { default: true } },
		content: 'inline*',
		group: 'block',
		defining: true,
		parseDOM: [
			{ tag: 'h1', attrs: { level: 1 } },
			{ tag: 'h2', attrs: { level: 2 } },
			{ tag: 'h3', attrs: { level: 3 } }
		],
		toDOM(node) {
			return ['h' + node.attrs.level, node.attrs.numbered === false ? { 'data-unnumbered': 'true' } : {}, 0];
		}
	} as NodeSpec,

	code_block: {
		content: 'text*',
		marks: '',
		group: 'block',
		attrs: {
			// '' = no language recorded: plain text, and the settings popover shows no chip. The old
			// 'Markdown' default painted markdown colours over every fresh verbatim block.
			lang: { default: '' },
			// which verbatim-family environment this came from (verbatim/lstlisting/minted) and its
			// verbatim args, so the serializer reconstructs the same environment
			env: { default: 'verbatim' },
			args: { default: '' }
		},
		code: true,
		defining: true,
		// a gap cursor may sit against this block: with no synthetic trailing paragraph any more,
		// the boundary itself is where an arrow-key exit lands (gapSelection.ts)
		createGapCursor: true,
		parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
		toDOM() {
			return preDom;
		}
	} as NodeSpec,

	/** raw LaTeX block, passed through unchanged. */
	raw_latex: {
		content: 'text*',
		marks: '',
		group: 'block',
		code: true,
		defining: true,
		createGapCursor: true, // same boundary contract as code_block above
		parseDOM: [{ tag: 'div.raw-latex-block', preserveWhitespace: 'full' }],
		toDOM() {
			return ['div', { class: 'raw-latex-block' }, ['code', 0]];
		}
	} as NodeSpec,

	// a cross-document include, rendered as a clickable chip (IncludeDocView). `command` keeps
	// which of \input/\include/\subfile was used so it round-trips exactly
	includedoc: {
		group: 'block',
		atom: true,
		selectable: true,
		attrs: {
			path: { default: '' },
			command: { default: 'input' }
		},
		parseDOM: [
			{
				tag: 'div.includedoc-node',
				getAttrs(dom: HTMLElement) {
					return {
						path: dom.getAttribute('data-path') || '',
						command: dom.getAttribute('data-command') || 'input'
					};
				}
			}
		],
		toDOM(node) {
			return ['div', { class: 'includedoc-node', 'data-path': node.attrs.path, 'data-command': node.attrs.command }];
		}
	} as NodeSpec,

	// sourceForm remembers whether the file used \begin{abstract} ('env') or \abstract{} ('macro')
	// so it round-trips in the original shape
	abstract: {
		content: 'block+',
		group: 'block',
		defining: true,
		attrs: {
			sourceForm: { default: 'env' }
		},
		parseDOM: [
			{
				tag: 'div.abstract',
				getAttrs(dom: HTMLElement) {
					return { sourceForm: dom.getAttribute('data-source-form') || 'env' };
				}
			}
		],
		toDOM(node) {
			return ['div', { class: 'abstract', 'data-source-form': node.attrs.sourceForm }, 0];
		}
	} as NodeSpec,

	// any environment without special handling wraps into this so its body stays editable
	environment: {
		content: 'block+',
		group: 'block',
		defining: true,
		allowGapCursor: true,
		attrs: {
			name: { default: 'environment' },
			// verbatim \begin{name} arguments ("[t]{0.4\linewidth}") so argument-taking environments
			// (minipage, wrapfigure, ...) don't lose args or leak them into the body
			args: { default: '' }
		},
		parseDOM: [
			{
				tag: 'div.tex-environment',
				getAttrs(dom: HTMLElement) {
					return { name: dom.getAttribute('data-env') || 'environment', args: dom.getAttribute('data-args') || '' };
				}
			}
		],
		toDOM(node) {
			return ['div', { class: 'tex-environment', 'data-env': node.attrs.name, 'data-args': node.attrs.args }, 0];
		}
	} as NodeSpec,

	block_math: {
		content: 'text*',
		group: 'block',
		marks: '',
		inline: false,
		code: true,
		defining: true,
		// atom alone makes gap cursors valid AGAINST this block (gapcursor's needsGap);
		// allowGapCursor was set here for years but governs gaps INSIDE the node it is on,
		// where text* content makes them impossible - it was never consulted
		atom: true,
		attrs: {
			label: { default: null },
			numbered: { default: false },
			environment: { default: null }, // 'align' | 'gather' | 'alignat' | null
			lineLabels: { default: [] } // per-line labels for multi-line environments
		},
		toDOM: (node) => {
			return [
				'div',
				{
					class: 'block-math',
					'data-label': node.attrs.label,
					'data-numbered': node.attrs.numbered,
					'data-environment': node.attrs.environment,
					'data-line-labels': JSON.stringify(node.attrs.lineLabels || [])
				},
				0
			];
		},
		parseDOM: [
			{
				tag: 'div.block-math',
				getAttrs: (dom: HTMLElement) => ({
					label: dom.getAttribute('data-label'),
					numbered: dom.getAttribute('data-numbered') === 'true',
					environment: dom.getAttribute('data-environment') || null,
					lineLabels: JSON.parse(dom.getAttribute('data-line-labels') || '[]')
				})
			}
		]
	} as NodeSpec,

	text: {
		group: 'inline'
	} as NodeSpec,

	// BASE spec only: updateImageNode (see latexPMSchema.ts) replaces it wholesale, and the
	// effective node is a block figure with caption content. this entry just puts the node
	// in the initial OrderedMap
	...imageNodes,

	hard_break: {
		inline: true,
		group: 'inline',
		selectable: false,
		// true = a \\ forced break. false is a legacy value kept so stale docs don't crash;
		// it serializes to nothing
		attrs: { lineBreak: { default: true } },
		parseDOM: [{ tag: 'br' }],
		toDOM() {
			return brDom;
		}
	} as NodeSpec,

	inline_math: {
		content: 'text*',
		group: 'inline',
		marks: '',
		inline: true,
		code: true,
		defining: true,
		atom: true,
		toDOM: () => {
			return [
				'span',
				{
					class: 'inline-math'
				},
				0
			];
		},
		parseDOM: [
			{
				tag: 'span.inline-math'
			}
		],
		leafText: (node) => {
			return `$${node.textContent}$`;
		}
	} as NodeSpec,

	/** inline raw LaTeX (unknown/unhandled macros), passed through unchanged. */
	inline_latex: {
		content: 'text*',
		group: 'inline',
		marks: '',
		inline: true,
		code: true,
		defining: true,
		atom: false,
		toDOM: () => {
			return [
				'code',
				{
					class: 'inline-latex',
					title: 'Raw LaTeX (passed through unchanged)'
				},
				0
			];
		},
		parseDOM: [
			{
				tag: 'code.inline-latex'
			}
		],
		leafText: (node) => {
			return node.textContent;
		}
	} as NodeSpec,
	citation: citationNodeSpec,
	ref: refNodeSpec,
	label: labelNodeSpec,

	// caption + table + optional notes; header rows/columns are prosemirror-tables' native
	// table_header nodes
	...tableFamilyNodes,

	list: createListSpec()
};

// raw LaTeX between \begin{itemize} and the first \item (\setlength\itemsep{0pt} setup is
// common). the list node models one PM node per \item, so this has nowhere else to live:
// carried verbatim on the FIRST list node of the group, spliced back after \begin{...}
nodes.list.attrs = { ...(nodes.list.attrs ?? {}), preBody: { default: null } };

// verbatim source preservation: every block the importer can emit at the top level carries
// orig: { latex, norm, pre, seq, start, group* }. latex = original slice; norm = its parse-time
// deterministic serialization; pre = inter-block source; seq = pristine top-level index;
// start = body-relative offset (positional consumers like scroll sync); group* set when one
// construct became several blocks (itemize = one list node per item) so substitution is
// all-or-nothing. the serializer re-emits `latex` only while the block still serializes to
// exactly `norm`, so a stale slice can never overwrite an edit. default null: editor-created
// nodes always go through the deterministic rules. (image gets its orig in updateImageNode)
const ORIG_BLOCKS = [
	'paragraph',
	'blockquote',
	'horizontal_rule',
	'heading',
	'code_block',
	'raw_latex',
	'includedoc',
	'abstract',
	'environment',
	'block_math',
	'table_wrapper',
	'table', // a bare tabular (no float wrapper) imports as a bare table at the top level
	'list'
] as const;
for (const name of ORIG_BLOCKS) {
	const spec = (nodes as Record<string, NodeSpec>)[name];
	spec.attrs = { ...(spec.attrs ?? {}), orig: { default: null } };
}
