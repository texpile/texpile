// Find in a PDF view with the focus means the PDF, not the editor beside it
import { pdfFindToggle } from '$lib/stores/editorStore';

const finds = new WeakMap<Element, () => void>();

/** `{@attach}` on a view's pages; a view that goes away takes its find bar with it, so the split does not reopen on one */
export function pdfViewFind(toggle: () => void, close: () => void) {
	return (view: HTMLElement) => {
		finds.set(view, toggle);
		return () => {
			finds.delete(view);
			close();
		};
	};
}

// a popped-out preview is another window, whose elements are not this window's Element
export function elementOf(at: EventTarget | null): Element | null {
	return at && (at as Node).nodeType === Node.ELEMENT_NODE ? (at as Element) : null;
}

/** the find bar of the PDF view holding `at`, else a .pdf tab's */
export function pdfFindFor(at: EventTarget | null): (() => void) | null {
	const view = elementOf(at)?.closest('[data-pdf-view]');
	return (view && finds.get(view)) ?? pdfFindToggle.current;
}
