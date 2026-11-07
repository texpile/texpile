import { baseNodes } from '$lib/editor/visual/schema/basePMSchema';
import type { NodeSpec } from 'prosemirror-model';

const base = baseNodes as Record<string, NodeSpec>;

export const coreNodes: Record<string, NodeSpec> = {
	...base,

	// any environment without special handling wraps into this so its body stays editable
	environment: {
		content: 'block+',
		group: 'block',
		definingAsContext: true,
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
	}
};
