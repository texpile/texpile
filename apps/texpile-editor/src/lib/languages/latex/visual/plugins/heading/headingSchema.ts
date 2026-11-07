import type { NodeSpec } from 'prosemirror-model';

// level 1-3 maps to \section / \subsection / \subsubsection; the base parses h4-h6 as well,
// for the dialects that nest that far
export function widenHeading(base: NodeSpec): NodeSpec {
	return {
		...base,
		// command: the source command when it is not the level's own (\chapter, \part show as
		// level 1 and must not come back as \section)
		attrs: { ...base.attrs, command: { default: null }, shortTitle: { default: null } },
		parseDOM: [
			{ tag: 'h1', attrs: { level: 1 } },
			{ tag: 'h2', attrs: { level: 2 } },
			{ tag: 'h3', attrs: { level: 3 } }
		]
	};
}
