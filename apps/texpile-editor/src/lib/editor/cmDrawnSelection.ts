// CodeMirror's drawn selection, without its rule for the descendants of a focused element
import { Prec, type Extension } from '@codemirror/state';
import { drawSelection, EditorView as CMView } from '@codemirror/view';

// CodeMirror's own theme for the native selection it hides, less `.cm-content :focus ::selection`. A rule whose subject
// is every descendant of whatever has the focus makes the browser restyle the whole subtree of any element that
// takes or loses it: 100 ms for the visual editor of a paper, on every click into it and out of it
const nativeSelectionHidden = Prec.highest(
	CMView.theme({
		'.cm-line': {
			'& ::selection, &::selection': { backgroundColor: 'transparent !important' },
			caretColor: 'transparent !important'
		},
		'.cm-content': {
			caretColor: 'transparent !important',
			'& :focus': {
				caretColor: 'initial !important',
				'&::selection': { backgroundColor: 'Highlight !important' }
			}
		}
	})
);

// the one part of drawSelection that is wrapped in a precedence
function isOwnTheme(part: Extension): boolean {
	return typeof part === 'object' && part !== null && 'prec' in part;
}

export function cmDrawnSelection(config?: Parameters<typeof drawSelection>[0]): Extension {
	return (drawSelection(config) as readonly Extension[]).map((part) => (isOwnTheme(part) ? nativeSelectionHidden : part));
}
