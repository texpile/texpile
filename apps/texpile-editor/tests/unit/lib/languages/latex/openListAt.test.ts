import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { openListAt } from '$lib/languages/latex/source/openListAt';

// The cost of being wrong here is asymmetric. A missed bullet is one keystroke; a bullet
// inserted into a tabular row or a verbatim block edits the document wrongly under the
// writer's hands. So the negative cases carry the weight, not the positive one.
const at = (doc: string) => openListAt(EditorState.create({ doc: doc.replace('|', ''), extensions: [latex()] }), doc.indexOf('|'));

describe('openListAt says yes', () => {
	it('inside an item of each list kind', () => {
		for (const env of ['itemize', 'enumerate', 'description'])
			expect(at(`\\begin{${env}}\n\\item first|\n\\end{${env}}`)).toMatchObject({ env });
	});

	it('in the innermost list when lists nest', () => {
		expect(at('\\begin{itemize}\n\\item outer\n\\begin{enumerate}\n\\item inner|\n')).toMatchObject({ env: 'enumerate' });
	});

	it('on a continuation line of a multi-line item', () => {
		expect(at('\\begin{itemize}\n\\item first line\n  second line|\n')).toMatchObject({ env: 'itemize' });
		expect(at('\\begin{itemize}\n\\item first line\n  wrapped on\n  and on|')).toMatchObject({ env: 'itemize' });
	});

	it('in a list however far its item runs', () => {
		expect(at('\\begin{itemize}\n\\item first\n' + 'filler line\n'.repeat(60) + '|')).toMatchObject({ env: 'itemize' });
	});
});

describe('openListAt says no', () => {
	it('outside any list', () => {
		expect(at('Plain prose here.|')).toBeNull();
	});

	it('between \\begin and the first \\item', () => {
		expect(at('\\begin{itemize}\n|\n\\item first\n')).toBeNull();
	});

	it('after the list has closed', () => {
		expect(at('\\begin{itemize}\n\\item first\n\\end{itemize}\n\nAfter.|')).toBeNull();
	});

	it('inside a tabular nested in a list', () => {
		expect(at('\\begin{itemize}\n\\item a table\n\\begin{tabular}{ll}\na & b|\n')).toBeNull();
	});

	it('inside an equation nested in a list', () => {
		expect(at('\\begin{itemize}\n\\item math\n\\begin{equation}\nx = y|\n')).toBeNull();
	});

	it('inside a verbatim body that PRINTS a list', () => {
		// the classic false positive: the words are there, none of them are commands
		expect(at('\\begin{verbatim}\n\\begin{itemize}\n\\item not real|\n')).toBeNull();
	});

	it('inside lstlisting and minted bodies too', () => {
		for (const env of ['lstlisting', 'minted']) expect(at(`\\begin{${env}}\n\\begin{itemize}\n\\item printed|\n`)).toBeNull();
	});

	it('in a bibliography, whose entries are \\bibitem', () => {
		expect(at('\\begin{thebibliography}{9}\n\\bibitem{a} Smith|\n')).toBeNull();
		expect(at('\\begin{itemize}\n\\item a\n\\bibitem{b} stray|\n')).toBeNull();
	});

	it('after a verbatim block that printed an unclosed list', () => {
		// the verbatim body is skipped whole, so its \begin{itemize} never opened anything
		expect(at('\\begin{verbatim}\n\\begin{itemize}\n\\end{verbatim}\nAfter the block.|')).toBeNull();
	});

	it('when the list opener is commented out', () => {
		expect(at('% \\begin{itemize}\n\\item this is not in a list|\n')).toBeNull();
	});

	it('across a blank line, which ends the item', () => {
		expect(at('\\begin{itemize}\n\\item first\n\n|')).toBeNull();
	});

	it('after an environment closed in the item', () => {
		expect(at('\\begin{itemize}\n\\item a table\n\\begin{tabular}{ll}\na\\end{tabular}\n|')).toBeNull();
	});

	it('when the only list opener is a commented line inside a verbatim body', () => {
		expect(at('\\begin{verbatim}\n% \\begin{itemize}\n\\item x|\n')).toBeNull();
	});

	it('but an ESCAPED percent does not start a comment', () => {
		expect(at('\\begin{itemize}\n\\item 50\\% done|\n')).toMatchObject({ env: 'itemize' });
	});

	it('when \\end does not match the innermost open env', () => {
		// mid-edit or malformed: guessing which environment that closes is the guess to refuse
		expect(at('\\begin{itemize}\n\\item first\n\\end{enumerate}\n|')).toBeNull();
	});

	it('for an \\item that is not inside any list', () => {
		expect(at('\\item stray item|\n')).toBeNull();
	});

	it('inside a starred environment that is not a list', () => {
		expect(at('\\begin{figure*}\n\\item nonsense|\n')).toBeNull();
	});
});
