import type { Attrs, Node } from 'prosemirror-model';
import { TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import type { InsertItem } from './insertItem';

function aloneIn(state: EditorState, typeName: string) {
	const { $from } = state.selection;
	if ($from.depth < 2 || !$from.parent.isTextblock) return null;
	const env = $from.node(-1);
	return env.type.name === typeName && env.childCount === 1 ? { $from, env } : null;
}

export function renameLoneEnvironment(typeName: string, attrsFor: (env: Node) => Attrs): Command {
	return (state, dispatch) => {
		const found = aloneIn(state, typeName);
		if (!found) return false;
		const attrs = attrsFor(found.env);
		if (attrs.name !== found.env.attrs.name) dispatch?.(state.tr.setNodeMarkup(found.$from.before(-1), undefined, attrs));
		return true;
	};
}

export function unwrapLoneEnvironment(typeName: string): Command {
	return (state, dispatch) => {
		const found = aloneIn(state, typeName);
		// a labelled one stays, as its references would point at nothing
		if (!found || found.$from.parent.type.name !== 'paragraph' || found.env.attrs.label) return false;
		const { $from } = found;
		if (dispatch) {
			const start = $from.before(-1);
			const tr = state.tr.replaceWith(start, $from.after(-1), $from.parent);
			dispatch(tr.setSelection(TextSelection.create(tr.doc, start + 1 + $from.parentOffset)).scrollIntoView());
		}
		return true;
	};
}

export function styleEnvironmentOf(
	items: readonly InsertItem[],
	typeName: string,
	alsoNamed: readonly string[] = []
): (node: Node) => boolean {
	const styles = items.filter((item) => item.shape === 'block' && item.paragraphStyle);
	return (node) =>
		node.type.name === typeName &&
		(alsoNamed.includes(node.attrs.name) || styles.some((item) => item.shape === 'block' && item.is?.(node)));
}

export function onlyInStyleEnvironments(items: InsertItem[], isStyle: (env: Node) => boolean): InsertItem[] {
	return items.map((item) => {
		const { turnIn } = item as { turnIn?: Command };
		if (item.shape !== 'block' || !turnIn) return item;
		function guarded(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
			const { $from } = state.selection;
			return $from.depth >= 2 && isStyle($from.node(-1)) && turnIn!(state, dispatch);
		}
		return { ...item, turnIn: guarded };
	});
}
