import { describe, expect, it } from 'vitest';
import { openListAt, inInlineMath, itemLineAbove } from '$lib/languages/latex/source/openListAt';

// The cost of being wrong here is asymmetric. A missed bullet is one keystroke; a bullet
// inserted into a tabular row or a verbatim block edits the document wrongly under the
// writer's hands. So the negative cases carry the weight, not the positive one.
const at = (doc: string) => openListAt(doc.replace('|', ''), doc.indexOf('|'));

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
		for (const env of ['lstlisting', 'minted'])
			expect(at(`\\begin{${env}}\n\\begin{itemize}\n\\item printed|\n`)).toBeNull();
	});

	it('after a verbatim block that printed an unclosed list', () => {
		// the verbatim body is skipped whole, so its \begin{itemize} never opened anything
		expect(at('\\begin{verbatim}\n\\begin{itemize}\n\\end{verbatim}\nAfter the block.|')).toBeNull();
	});

	it('when the list opener is commented out', () => {
		expect(at('% \\begin{itemize}\n\\item this is not in a list|\n')).toBeNull();
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

// the second, independent reading: the caret must be plainly at the end of a bullet. Both
// this and the document scan have to agree before a bullet is ever inserted.
describe('itemLineAbove', () => {
	const walk = (doc: string) => {
		const lines = doc.split('\n');
		return itemLineAbove(lines, lines.findIndex((l) => l.includes('|')));
	};

	it('yes when the caret line IS the item', () => {
		expect(walk('\\begin{itemize}\n\\item first|')).toBe(true);
	});

	it('yes on a wrapped continuation line of that item', () => {
		expect(walk('\\begin{itemize}\n\\item first line\n  wrapped on\n  and on|')).toBe(true);
	});

	it('yes directly under the list opener', () => {
		expect(walk('\\begin{itemize}\n|')).toBe(true);
	});

	it('no across a blank line, which ends the bullet', () => {
		expect(walk('\\begin{itemize}\n\\item first\n\n|')).toBe(false);
	});

	it('no across an \\end of anything', () => {
		expect(walk('\\begin{itemize}\n\\item first\n\\end{itemize}\n|')).toBe(false);
	});

	it('no across another environment opening', () => {
		expect(walk('\\begin{itemize}\n\\item a table\n\\begin{tabular}{ll}\n|')).toBe(false);
	});

	it('no in plain prose with no bullet above at all', () => {
		expect(walk('Just prose.\nMore prose.\n|')).toBe(false);
	});

	it('no when the bullet is further away than the walk cap', () => {
		expect(walk('\\item first\n' + 'filler line\n'.repeat(60) + '|')).toBe(false);
	});
});

describe('inInlineMath', () => {
	it('is true between unescaped dollars and false outside', () => {
		expect(inInlineMath('text $x + y', 10)).toBe(true);
		expect(inInlineMath('text $x$ more', 12)).toBe(false);
		expect(inInlineMath('cost \\$5 today', 12)).toBe(false);
	});
});
