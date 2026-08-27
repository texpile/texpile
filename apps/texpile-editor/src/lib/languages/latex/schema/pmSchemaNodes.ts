import { citationNodeSpec } from '$lib/languages/latex/visual/extensions/citation/citationSchema';
import { refNodeSpec } from '$lib/languages/latex/visual/extensions/ref/refSchema';
import { labelNodeSpec } from '$lib/languages/latex/visual/extensions/label/labelSchema';
import { baseNodes, withOrigAttr } from '$lib/editor/visual/schema/basePMSchema';
import type { NodeSpec } from 'prosemirror-model';

const base = baseNodes as Record<string, NodeSpec>;

export const nodes: Record<string, NodeSpec> = {
	...base,

	// level 1-3 maps to \section / \subsection / \subsubsection; the base parses h4-h6 as well,
	// for the dialects that nest that far
	heading: {
		...base.heading,
		parseDOM: [
			{ tag: 'h1', attrs: { level: 1 } },
			{ tag: 'h2', attrs: { level: 2 } },
			{ tag: 'h3', attrs: { level: 3 } }
		]
	},

	// sourceForm remembers whether the file used \begin{abstract} ('env') or \abstract{} ('macro')
	// so it round-trips in the original shape
	abstract: withOrigAttr({
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
	}),

	// any environment without special handling wraps into this so its body stays editable
	environment: withOrigAttr({
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
	}),

	citation: citationNodeSpec,
	ref: refNodeSpec,
	label: labelNodeSpec
};
