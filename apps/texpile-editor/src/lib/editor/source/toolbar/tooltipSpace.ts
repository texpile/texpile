// where the source editor's tooltips may go: the editor, below the format bar that floats over its top
import type { EditorView as CMView, Rect } from '@codemirror/view';

export function sourceTooltipSpace(view: CMView): Rect {
	const { left, right, top, bottom } = view.scrollDOM.getBoundingClientRect();
	const bar = view.dom.closest(':has(> [data-format-bar])')?.querySelector(':scope > [data-format-bar]');
	const barBottom = bar ? bar.getBoundingClientRect().bottom + 4 : top;
	return { left, right, top: Math.min(Math.max(top, barBottom), bottom), bottom };
}
