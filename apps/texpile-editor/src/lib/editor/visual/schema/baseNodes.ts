// The document model every visual dialect derives from: the nodes LaTeX, Markdown and Typst all
// carry. Dialect-only nodes (tex's environment/citation, typst's term lists) and dialect
// deviations are declared as overrides in each language's own schema, on NEW spec objects —
// mutating these literals would leak across dialects.
//
// Deliberately DOM-import-free beyond prosemirror-model: the parse worker loads this module.
import { createListSpec } from 'prosemirror-flat-list';
import { imageNodes, tableFamilyNodes } from './floatNodes';
import type { NodeSpec, DOMOutputSpec } from 'prosemirror-model';

const pDom: DOMOutputSpec = ['p', 0],
	blockquoteDom: DOMOutputSpec = ['blockquote', { class: 'blockquote' }, 0],
	hrDom: DOMOutputSpec = ['hr'],
	preDom: DOMOutputSpec = ['pre', ['code', 0]],
	brDom: DOMOutputSpec = ['br'];

export const baseNodes = {
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

	// six levels because markdown and typst nest that far; numbered=false is tex's starred form
	heading: {
		attrs: { level: { default: 1 }, numbered: { default: true } },
		content: 'inline*',
		group: 'block',
		defining: true,
		parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
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

	/** raw source block, passed through unchanged; the dialect's own `lang` attr says which. */
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

	// BASE spec only: each dialect's updateImageNode call replaces it wholesale, and the effective
	// node is a block figure with caption content. this entry just puts the node in the initial
	// OrderedMap
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

	/** inline raw source (unknown/unhandled markup), passed through unchanged. */
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

	// caption + table + optional notes; header rows/columns are prosemirror-tables' native
	// table_header nodes
	...tableFamilyNodes,

	list: createListSpec()
};

// raw LaTeX between \begin{itemize} and the first \item (\setlength\itemsep{0pt} setup is
// common). the list node models one PM node per \item, so this has nowhere else to live:
// carried verbatim on the FIRST list node of the group, spliced back after \begin{...}
baseNodes.list.attrs = { ...(baseNodes.list.attrs ?? {}), preBody: { default: null } };

// verbatim source preservation: every block an importer can emit at the top level carries
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
	'block_math',
	'table_wrapper',
	'table', // a bare tabular (no float wrapper) imports as a bare table at the top level
	'list'
] as const;

/** add the `orig` attr to a block spec; dialect-only blocks apply it to their own additions. */
export function withOrigAttr(spec: NodeSpec): NodeSpec {
	return { ...spec, attrs: { ...(spec.attrs ?? {}), orig: { default: null } } };
}

const specs = baseNodes as Record<string, NodeSpec>;
for (const name of ORIG_BLOCKS) specs[name] = withOrigAttr(specs[name]);
