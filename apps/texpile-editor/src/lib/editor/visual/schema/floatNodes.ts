// the float family: the image node plus the table wrapper/caption/notes and prosemirror-tables specs
import type { NodeSpec } from 'prosemirror-model';
import { tableNodes, type TableNodesOptions } from 'prosemirror-tables';

const tableNodeSpecs = tableNodes({
	tableGroup: 'block',
	cellContent: 'paragraph+',
	cellAttributes: {
		background: {
			default: null,
			getFromDOM(dom) {
				return dom.style.backgroundColor || null;
			},
			setDOMAttr(value, attrs) {
				// eslint-disable-next-line no-param-reassign -- prosemirror-tables collects DOM attrs by mutation
				if (value) attrs.style = (attrs.style || '') + `background-color: ${value};`;
			}
		}
	}
} as TableNodesOptions);

// carry the exact LaTeX table architecture (env name, verbatim colspec, tabularx width,
// \hline/\bottomrule rules) so a parsed table round-trips render-identically instead of being
// reflowed into the default tabularx style. DOM copy/paste falls back to defaults
tableNodeSpecs.table.attrs = {
	...(tableNodeSpecs.table.attrs ?? {}),
	env: { default: null },
	colspec: { default: null },
	tabularxWidth: { default: null },
	bottomRules: { default: '' }
};
tableNodeSpecs.table_row.attrs = {
	...(tableNodeSpecs.table_row.attrs ?? {}),
	topRules: { default: '' }
};

export const imageNodes = {
	image: {
		inline: true,
		attrs: {
			src: {},
			alt: { default: null },
			title: { default: null },
			label: { default: null },
			numbered: { default: true },
			showCaption: { default: true },
			spanning: { default: false }, // figure* for multi-column documents
			// verbatim \includegraphics optional args ("width=\textwidth, trim=0 0 0 36, clip") so the
			// image keeps its exact size/crop. '' = source had no [..]; null = editor-created (default width)
			options: { default: null },
			// for imported figures: the whole \begin{figure}...\end{figure} verbatim with the
			// \includegraphics/\caption/\label swapped for sentinel tokens, so surrounding scaffolding
			// (\centerline, \captionsetup, placement, custom macros) round-trips untouched.
			// null = editor-created (standard figure generator)
			figureTemplate: { default: null },
			// true for a bare \includegraphics that was NOT inside a figure float (common inside
			// minipage layouts using \captionof). without it the serializer would wrap the image in a
			// synthesized \begin{figure}, and a float nested in a minipage is often a compile error
			bareOriginal: { default: false },
			// verbatim short-caption arg of \caption[short]{long}, brackets excluded. the slot
			// mechanism replaces the whole \caption, and dropping [short] makes the caption package's
			// argument scanner choke fatally on the next bracket-less \caption. not editable
			captionOpt: { default: null }
		},
		group: 'inline',
		draggable: true,
		parseDOM: [
			{
				tag: 'img[src]',
				getAttrs(dom: HTMLElement) {
					return {
						src: dom.getAttribute('src'),
						title: dom.getAttribute('title'),
						alt: dom.getAttribute('alt'),
						label: dom.getAttribute('data-label'),
						numbered: dom.getAttribute('data-numbered') !== 'false',
						showCaption: dom.getAttribute('data-show-caption') !== 'false',
						spanning: dom.getAttribute('data-spanning') === 'true'
					};
				}
			}
		],
		toDOM(node) {
			const { src, alt, title, label, numbered, showCaption, spanning } = node.attrs;
			return [
				'img',
				{
					src,
					alt,
					title,
					'data-label': label,
					'data-numbered': numbered ? 'true' : 'false',
					'data-show-caption': showCaption ? 'true' : 'false',
					'data-spanning': spanning ? 'true' : 'false'
				}
			];
		}
	} as NodeSpec
};

export const tableFamilyNodes = {
	table_wrapper: {
		content: 'table_caption table table_notes?',
		group: 'block',
		// a gap cursor may sit against the float (gapSelection.ts). load-bearing detail: needsGap
		// checks THIS spec before descending, so even a wrapper ending in inline-content
		// table_notes - which no plain position after it could ever satisfy - admits the gap
		createGapCursor: true,
		attrs: {
			label: { default: null },
			// a table with several \label{}s keeps the last in `label` (what the reference-manager UI
			// reads) and the rest here, newline-joined, each re-emitted as its own \label{} line
			extraLabels: { default: null },
			showNotes: { default: false },
			spanning: { default: false }, // table* for multi-column documents
			// raw LaTeX that must precede the tabular to affect it (\setlength{\tabcolsep}{...}),
			// round-tripped verbatim as a prefix
			preBody: { default: null },
			// raw LaTeX after the tabular that isn't notes prose (a trailing \vskip spacer),
			// round-tripped verbatim and kept OUT of the notes wrapper's \small styling
			postBody: { default: null },
			// float placement specifier. [H] (float package) forces placement while [h] is only a
			// hint, so preserve whichever the source had; [h] is the default only for a brand new
			// editor-created table
			placement: { default: '[h]' }
		},
		parseDOM: [
			{
				tag: 'div[data-table-wrapper]',
				getAttrs: (dom: HTMLElement) => ({
					label: dom.getAttribute('data-label'),
					extraLabels: dom.getAttribute('data-extra-labels'),
					showNotes: dom.getAttribute('data-show-notes') === 'true',
					spanning: dom.getAttribute('data-spanning') === 'true',
					preBody: dom.getAttribute('data-pre-body'),
					postBody: dom.getAttribute('data-post-body'),
					placement: dom.getAttribute('data-placement')
				})
			}
		],
		toDOM(node) {
			return [
				'div',
				{
					'data-table-wrapper': '',
					'data-label': node.attrs.label,
					'data-extra-labels': node.attrs.extraLabels,
					'data-show-notes': node.attrs.showNotes,
					'data-spanning': node.attrs.spanning ? 'true' : 'false',
					'data-pre-body': node.attrs.preBody,
					'data-post-body': node.attrs.postBody,
					'data-placement': node.attrs.placement,
					class: 'table-wrapper'
				},
				0
			];
		}
	} as NodeSpec,

	table_caption: {
		content: 'inline*',
		parseDOM: [{ tag: 'div[data-table-caption]' }],
		toDOM() {
			return ['div', { 'data-table-caption': '', class: 'table-caption' }, 0];
		}
	} as NodeSpec,

	table_notes: {
		content: 'inline*',
		parseDOM: [{ tag: 'div[data-table-notes]' }],
		toDOM() {
			return ['div', { 'data-table-notes': '', class: 'table-notes' }, 0];
		}
	} as NodeSpec,

	...tableNodeSpecs
};
