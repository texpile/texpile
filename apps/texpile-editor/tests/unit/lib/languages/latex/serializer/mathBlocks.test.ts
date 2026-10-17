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
});
