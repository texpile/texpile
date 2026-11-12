// the numbers Typst printed at the last compile, on the elements of the open file that print one. With no compile
// behind the document the plugin does nothing and every view counts as it did
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { typedInParagraph } from '$lib/editor/visual/extensions/nodeNumbers';
import { samePath } from '$lib/workspace/fileSystem';
import { onTypstPrintedNumbers, printedNumbersOfFile } from '$lib/stores/typstPrintedNumbers';
import { matchPrintedNumbers } from './matchPrinted';
import { figureSupplement, numberedElementsOf, readsInOtherFiles, type FoundElement } from './numberedElements';

export type TypstNumbersSetup = { filePath: () => string | null };

type NumbersState = { set: DecorationSet; printed: boolean };

export const typstNumbersKey = new PluginKey<NumbersState>('texpile-typst-numbers');

const NONE: NumbersState = { set: DecorationSet.empty, printed: false };

// a node's own view draws `numbers` as given: an empty list is a number that does not print, no list leaves the counting to the view
function nodeDecoration(doc: PMNode, element: FoundElement, number: string | null, captionPrefix: string): Decoration {
	const node = doc.nodeAt(element.pos)!;
	const end = element.pos + node.nodeSize;
	const numbers = number === null ? [] : [number];
	const name = node.type.name;
	if (name === 'heading' || name === 'image')
		return Decoration.node(element.pos, end, number === null ? {} : { 'data-number': number }, { numbers });
	return Decoration.node(element.pos, end, {}, name === 'typ_figure' ? { numbers, captionPrefix } : { numbers });
}

function decorate(doc: PMNode, path: string | null): NumbersState {
	const known = printedNumbersOfFile(path);
	if (!known) return NONE;
	const elements = numberedElementsOf(doc);
	const whole = !!path && samePath(known.main, path) && !readsInOtherFiles(doc);
	const numbers = matchPrintedNumbers(elements, known.items, whole);
	const decorations: Decoration[] = [];
	const notes = new Map<number, string[]>();
	elements.forEach((element, i) => {
		if (element.kind === 'footnote') notes.set(element.pos, [...(notes.get(element.pos) ?? []), numbers[i] ?? '']);
		else {
			const node = doc.nodeAt(element.pos)!;
			const number = numbers[i];
			const supplement = element.figureKind && node.type.name === 'typ_figure' ? figureSupplement(node.attrs.typFigure) : '';
			decorations.push(nodeDecoration(doc, element, number, number === null ? '' : `${supplement ? `${supplement} ` : ''}${number}: `));
		}
	});
	for (const [pos, joined] of notes)
		decorations.push(Decoration.node(pos, pos + doc.nodeAt(pos)!.nodeSize, {}, { footnotes: joined.join(',') }));
	return { set: DecorationSet.create(doc, decorations), printed: true };
}

// before the footnote plugin of the drawn chips: a chip reads the first `footnotes` it is handed
export function typstNumbersPlugin(setup: TypstNumbersSetup): Plugin<NumbersState> {
	return new Plugin<NumbersState>({
		key: typstNumbersKey,
		state: {
			init: (_, state) => decorate(state.doc, setup.filePath()),
			apply: (tr, state) => {
				if (!tr.docChanged && !tr.getMeta(typstNumbersKey)) return state;
				if (!tr.getMeta(typstNumbersKey) && state.printed && typedInParagraph(tr))
					return { ...state, set: state.set.map(tr.mapping, tr.doc) };
				return decorate(tr.doc, setup.filePath());
			}
		},
		props: {
			decorations: (state) => typstNumbersKey.getState(state)?.set,
			// the view's own figure counting stops when numbers are printed
			attributes: (state): Record<string, string> => (typstNumbersKey.getState(state)?.printed ? { 'data-compiled-numbers': 'true' } : {})
		},
		view(view) {
			const stop = onTypstPrintedNumbers(() => {
				if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(typstNumbersKey, true).setMeta('addToHistory', false));
			});
			return { destroy: stop };
		}
	});
}
