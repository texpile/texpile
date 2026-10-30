import { describe, expect, it } from 'vitest';
import { alignEnvironment, blockMath, hasDisplayEnvironment } from '$lib/languages/latex/serializer/mathBlocks';

describe('mathBlocks', () => {
	it('leaves content that already opens a display environment alone', () => {
		for (const env of ['align', 'equation*', 'gather*', 'eqnarray', 'displaymath', 'xalignat']) {
			expect(hasDisplayEnvironment(`\\begin{${env}}\nx\n\\end{${env}}`)).toBe(true);
		}
		expect(hasDisplayEnvironment('\\begin{cases} a \\end{cases}')).toBe(false);
		expect(blockMath('x = 1', { numbered: false })).toBe('\\[\nx = 1\n\\]\n');
	});

	it('puts the single label of a singly numbered environment on its last row', () => {
		const out = alignEnvironment('a \\\\ b', { environment: 'multline', lineLabels: [], label: 'eq:m', numbered: true });
		expect(out).toBe('\\begin{multline}\na \\\\\nb \\label{eq:m}\n\\end{multline}\n');
	});

	it('writes an empty display without a blank line', () => {
		expect(blockMath('', { numbered: false })).toBe('\\[\n\\]\n');
		expect(blockMath(' ', { numbered: true })).toBe('\\begin{equation}\n\\end{equation}\n');
	});

	it('writes no blank line inside a display, where TeX reads a paragraph break', () => {
		const out = alignEnvironment('a \\\\ b\n\n c', { environment: 'eqnarray', lineLabels: [], numbered: true });
		expect(out).not.toMatch(/\n[ \t]*\n/);
	});

	it('leaves a row that opens with a bracket to the row, past the line break before it', () => {
		const out = alignEnvironment('a &= 0, \\\\\n[b, c] &= 1', { environment: 'align', lineLabels: [], numbered: false });
		expect(out).not.toContain('\\\\[b');
	});

	it('keeps a row label live past a commented row break', () => {
		const body = '%a=b;\\\\\nc=d\\\\\ne=f % note';
		const out = alignEnvironment(`\\begin{eqnarray}${body}\\end{eqnarray}`, {
			environment: 'eqnarray',
			lineLabels: ['one', 'two'],
			numbered: true
		});
		expect(out).toBe('\\begin{eqnarray}\n%a=b;\\\\\nc=d \\label{one} \\\\\ne=f % note\n\\label{two}\n\\end{eqnarray}\n');
	});
});
