import { describe, expect, it } from 'vitest';
import { scanSourceMath } from '$lib/editor/source/extensions/math-preview/sourceMath';

function mathIn(text: string, markdown = false): string[] {
	return scanSourceMath(text, markdown).math.map((r) => text.slice(r.from, r.to));
}

describe('math in source with code', () => {
	it('LaTeX verbatim environments, \\verb and \\mintinline hold no math', () => {
		expect(mathIn('\\verb|$x$| then $y$')).toEqual(['$y$']);
		expect(mathIn('\\begin{verbatim}\n$a$\n\n$b$\n\\end{verbatim}\n$c$')).toEqual(['$c$']);
		expect(mathIn('\\mintinline{sh}|echo $a| and $b$')).toEqual(['$b$']);
	});
});
