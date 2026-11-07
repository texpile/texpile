import type { NodeSpec } from 'prosemirror-model';

export function widenHeading(base: NodeSpec): NodeSpec {
	return {
		...base,
		attrs: { ...base.attrs, command: { default: null }, shortTitle: { default: null } },
		parseDOM: [
			{ tag: 'h1', attrs: { level: 1 } },
			{ tag: 'h2', attrs: { level: 2 } },
			{ tag: 'h3', attrs: { level: 3 } }
		]
	};
}
