import { lift, splitBlockAs } from 'prosemirror-commands';
import type { Attrs, Node } from 'prosemirror-model';
import type { Command, EditorState, Transaction } from 'prosemirror-state';

// a heading keeps what it carries (a Typst <label>, numbering: none) but a \chapter moved off its level and a short title once unnumbered
function headingAttrs(node: Node, level: number, numbered?: boolean): Attrs {
	const kept: Record<string, unknown> = node.type.name === 'heading' ? { ...node.attrs } : {};
	if ('command' in kept && kept.level !== level) kept.command = null;
	const attrs = { ...kept, level, numbered: numbered ?? kept.numbered ?? true };
	if ('shortTitle' in kept && attrs.numbered === false) attrs.shortTitle = null;
	return attrs;
}

export function toggleHeading(level: number): Command {
	return function (state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
		const { from, to } = state.selection;
		let apply = false;

		state.doc.nodesBetween(from, to, function (node, pos) {
			if (apply) return false;
			if (node.type === state.schema.nodes.paragraph || node.type === state.schema.nodes.heading) {
				if (dispatch) {
					apply = true;
					let targetType;
					if (level === 0) {
						targetType = state.schema.nodes.paragraph;
					} else if (node.type === state.schema.nodes.heading && node.attrs.level === level) {
						targetType = state.schema.nodes.paragraph;
					} else {
						targetType = state.schema.nodes.heading;
					}

					const attrs = targetType === state.schema.nodes.heading ? headingAttrs(node, level) : {};
					const tr = state.tr.setBlockType(pos, pos + node.nodeSize, targetType, attrs);
					dispatch(tr);
				}
				return true;
			}
			// no return false here, keep descending into containers
		});

		return apply;
	};
}

/** always sets the block to heading `level` (0 = paragraph), unlike toggleHeading. unnumbered serializes to \section*. */
export function setHeadingLevel(level: number, numbered?: boolean): Command {
	return function (state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
		const { from, to } = state.selection;
		let applied = false;
		state.doc.nodesBetween(from, to, function (node, pos) {
			if (applied) return false;
			if (node.type === state.schema.nodes.paragraph || node.type === state.schema.nodes.heading) {
				if (dispatch) {
					applied = true;
					const targetType = level === 0 ? state.schema.nodes.paragraph : state.schema.nodes.heading;
					const attrs = level === 0 ? {} : headingAttrs(node, level, numbered);
					dispatch(state.tr.setBlockType(pos, pos + node.nodeSize, targetType, attrs));
				}
				return true;
			}
		});
		return applied;
	};
}

/** Enter inside a heading with a short title: the half after the caret is a heading without that title */
export function splitShortTitledHeading(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const { $from } = state.selection;
	if ($from.parent.type.name !== 'heading' || !$from.parent.attrs.shortTitle) return false;
	return splitBlockAs((node, atEnd) => (atEnd ? null : { type: node.type, attrs: { ...node.attrs, shortTitle: null } }))(state, dispatch);
}

export function toggleBlockQuote() {
	return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
		// state.schema, not the tex import: the menu bar runs this against whichever editor is open
		const blockquoteType = state.schema.nodes.blockquote;
		// already inside a blockquote: lift back out, so the shared quote action (toolbars, Format
		// menu, Mod-Shift-b) is a true toggle instead of nesting quote-in-quote on a second press
		const { $from } = state.selection;
		for (let d = $from.depth; d > 0; d--) {
			if ($from.node(d).type === blockquoteType) return lift(state, dispatch);
		}
		const { from, to } = state.selection;
		let transactionDispatched = false;

		const tr = state.tr;
		state.doc.nodesBetween(from, to, (node, pos) => {
			const wrapper = blockquoteType.createAndFill(null, node);
			if (wrapper) {
				tr.replaceWith(pos, pos + node.nodeSize, wrapper);
				transactionDispatched = true;
			}
		});

		if (transactionDispatched && dispatch) {
			dispatch(tr);
		}

		return true;
	};
}

const INDENT_STATES = ['auto', 'indent', 'noindent'];

/** cycles the cursor paragraph's first-line indent auto/indent/noindent (dir reverses); serializes to \indent / \noindent. */
export function cycleParagraphIndent(dir: 1 | -1): Command {
	return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
		const { $from } = state.selection;
		for (let d = $from.depth; d >= 0; d--) {
			const node = $from.node(d);
			if (node.type.name === 'paragraph') {
				const cur = Math.max(0, INDENT_STATES.indexOf(String(node.attrs.indent ?? 'auto')));
				const next = INDENT_STATES[(cur + dir + 3) % 3];
				if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(d), null, { ...node.attrs, indent: next }));
				return true;
			}
		}
		return false;
	};
}
