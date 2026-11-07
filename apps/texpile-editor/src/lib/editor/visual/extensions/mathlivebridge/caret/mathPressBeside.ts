// Chrome puts the caret of a press beside inline math in the math's host, which ProseMirror reads as before the math
import { TextSelection, type Selection } from 'prosemirror-state';
import type { ResolvedPos } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

const pressedAt = new WeakMap<EditorView, number>();

export function recordPress(view: EditorView, event: MouseEvent): void {
	pressedAt.delete(view);
	if (event.button !== 0 || event.detail > 1 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
	if (event.target instanceof Element && event.target.closest('.inline-math')) return;
	const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
	if (at) pressedAt.set(view, at.pos);
}

export function forgetPress(view: EditorView): void {
	pressedAt.delete(view);
}

function mathToward($head: ResolvedPos, at: number): { from: number; to: number } | null {
	if ($head.parent.type.name === 'inline_math') return { from: $head.before(), to: $head.after() };
	const math = at > $head.pos ? $head.nodeAfter : $head.nodeBefore;
	if (math?.type.name !== 'inline_math') return null;
	return at > $head.pos ? { from: $head.pos, to: $head.pos + math.nodeSize } : { from: $head.pos - math.nodeSize, to: $head.pos };
}

export function caretWherePressed(view: EditorView, $anchor: ResolvedPos, $head: ResolvedPos): Selection | null {
	const at = pressedAt.get(view);
	if (at === undefined || $anchor.pos !== $head.pos || at === $head.pos) return null;
	const math = mathToward($head, at);
	return math && (at === math.from || at === math.to) ? TextSelection.create($head.doc, at) : null;
}
