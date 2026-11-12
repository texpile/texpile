import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typstNumbersKey, typstNumbersPlugin } from '$lib/languages/typst/visual/extensions/numbers/typstNumbersPlugin';
import { forgetTypstPrintedNumbers, setTypstPrintedNumbers, type TypstPrintedNumber } from '$lib/stores/typstPrintedNumbers';

const MAIN = '/paper/main.typ';
const CHAPTER = '/paper/ch1.typ';
const item = (i: Partial<TypstPrintedNumber>): TypstPrintedNumber => ({
	kind: 'heading',
	number: null,
	label: null,
	text: '',
	page: 1,
	...i
});

const SRC = '= One <one>\n\nWords here.\n\n$ x $ <eq>\n\n= Unlisted\n';

// the store's change reaches the plugin as a transaction; here it is applied by hand
function mount(path: string) {
	let state = EditorState.create({ doc: typstToProseMirror(SRC).doc, plugins: [typstNumbersPlugin({ filePath: () => path })] });
	return {
		get state() {
			return state;
		},
		refresh: () => (state = state.apply(state.tr.setMeta(typstNumbersKey, true)))
	};
}

function handed(state: EditorState) {
	return typstNumbersKey
		.getState(state)!
		.set.find()
		.map((d) => ({ at: state.doc.nodeAt(d.from)!.type.name, ...d.spec }));
}

afterEach(() => forgetTypstPrintedNumbers(MAIN));

describe('the numbers of the last compile on the editor', () => {
	it('hands them to the elements of a file of the compiled document, and takes them back when they are forgotten', () => {
		const editor = mount(CHAPTER);
		expect(handed(editor.state)).toEqual([]);
		setTypstPrintedNumbers(
			MAIN,
			[CHAPTER],
			[item({ number: '4', text: 'One', label: 'one' }), item({ kind: 'equation', number: '(9)', label: 'eq' })]
		);
		editor.refresh();
		expect(handed(editor.state)).toEqual([
			{ at: 'heading', numbers: ['4'] },
			{ at: 'block_math', numbers: ['(9)'] },
			{ at: 'heading', numbers: [] }
		]);
		forgetTypstPrintedNumbers(MAIN);
		editor.refresh();
		expect(handed(editor.state)).toEqual([]);
	});

	it('hands nothing to a file that is no part of the compiled document', () => {
		setTypstPrintedNumbers(MAIN, [CHAPTER], [item({ number: '1', text: 'One', label: 'one' })]);
		const editor = mount('/other/notes.typ');
		expect(handed(editor.state)).toEqual([]);
	});
});
