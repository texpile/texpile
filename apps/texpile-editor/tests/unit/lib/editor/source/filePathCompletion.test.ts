import { afterEach, describe, expect, it } from 'vitest';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { filePathCompletionSource } from '$lib/editor/source/filePathCompletion';
import { filePathStore } from '$lib/stores/editorStore';

const FILES = ['main.tex', 'chap/one.tex', 'refs.bib', 'img/a.png', 'sub/part.tex', 'code/run.py'];

// the text before `|` is the document up to the caret
function offered(text: string) {
	const pos = text.indexOf('|');
	const doc = text.replaceAll('|', '');
	const result = filePathCompletionSource(new CompletionContext(EditorState.create({ doc }), pos, true));
	return result && { from: result.from, apply: result.options.map((o) => o.apply), validFor: result.validFor };
}

afterEach(() => (filePathStore.current = []));

describe('file path completion', () => {
	it('offers the files of the argument the caret is in and drops the extension TeX adds itself', () => {
		filePathStore.current = FILES;
		expect(offered('\\input{|')?.apply).toEqual(['main.tex', 'chap/one.tex', 'sub/part.tex']);
		expect(offered('\\include{|')?.apply).toEqual(['main', 'chap/one', 'sub/part']);
		expect(offered('\\includeonly{main,|')).toMatchObject({ from: 18, apply: ['main', 'chap/one', 'sub/part'] });
		expect(offered('\\includegraphics*[width=1cm]{|')?.apply).toEqual(['img/a.png']);
		expect(offered('\\input{a,|')?.validFor).toEqual(/^[^{}]*$/);
		expect(offered('\\input a|')).toBeNull();
		expect(offered('\\includegraphics[|')).toBeNull();
	});

	it('completes the file group of two-group commands and sits it under the folder group', () => {
		filePathStore.current = FILES;
		expect(offered('\\inputminted{python}{|')?.apply).toEqual(FILES);
		expect(offered('\\inputminted{|')).toBeNull();
		expect(offered('\\import{sub/}{|')?.apply).toEqual(['part.tex']);
		expect(offered('\\import{sub/|')).toBeNull();
	});

	it('offers any file to a listing and keeps its extension', () => {
		filePathStore.current = FILES;
		expect(offered('\\lstinputlisting[language=Python]{|')?.apply).toEqual(FILES);
		expect(offered('\\verbatiminput{|')?.apply).toEqual(FILES);
	});

	it('offers graphicspath relative names next to the full paths', () => {
		filePathStore.current = FILES;
		expect(offered('\\graphicspath{{img/}}\n\\includegraphics{|')?.apply).toEqual(['a.png', 'img/a.png']);
	});
});
