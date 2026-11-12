import { describe, it, expect } from 'vitest';
import { parseMarkdownFile, serializeMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';

const SAMPLE = `Angle. From notes_principal.png:

$$\\tan(2\\theta_{p1}) = \\frac{2\\tau_{xy}}{\\sigma_x - \\sigma_y} \\quad\\Rightarrow\\quad \\theta_{p1} = 30.9^\\circ, \\qquad \\theta_{p2} = \\theta_{p1} + 90^\\circ$$

Values. From notes_principal.png:

$$\\sigma_{1,2} = \\frac{\\sigma_x + \\sigma_y}{2} \\pm \\sqrt{\\left(\\frac{\\sigma_x - \\sigma_y}{2}\\right)^2 + \\tau_{xy}^2}$$
$$\\boxed{\\sigma_1 = +7.44\\ \\text{MPa}} \\qquad \\boxed{\\sigma_2 = -20.8\\ \\text{MPa}}$$

Which angle goes with $\\sigma_1$? The $\\tan$ formula says $\\theta_{p1} = 30.9^\\circ$ and $a\\ b$.

$$
x_1 = y_2
$$
`;

function mathOf(md: string) {
	const found: { type: string; text: string }[] = [];
	parseMarkdownFile(md).doc.descendants((n) => {
		if (n.type.name === 'block_math' || n.type.name === 'inline_math') found.push({ type: n.type.name, text: n.textContent });
	});
	return found;
}

describe('markdown math', () => {
	it('reads single line and adjacent $$ lines and inline $ as math with the TeX intact', () => {
		const found = mathOf(SAMPLE);
		expect(found.map((m) => m.type)).toEqual([
			'block_math',
			'block_math',
			'block_math',
			'inline_math',
			'inline_math',
			'inline_math',
			'inline_math',
			'block_math'
		]);
		expect(found[0].text).toContain('\\theta_{p1}) = \\frac{2\\tau_{xy}}{\\sigma_x - \\sigma_y}');
		expect(found[2].text).toBe('\\boxed{\\sigma_1 = +7.44\\ \\text{MPa}} \\qquad \\boxed{\\sigma_2 = -20.8\\ \\text{MPa}}');
		expect(found[6].text).toBe('a\\ b');
	});

	it('reads two $$ spans in one line as inline math, each with its TeX', () => {
		const md = '$$a_1 = 2$$ and $$b_2 = 3$$\n';
		expect(mathOf(md)).toEqual([
			{ type: 'inline_math', text: 'a_1 = 2' },
			{ type: 'inline_math', text: 'b_2 = 3' }
		]);
		const parsed = parseMarkdownFile(md);
		expect(serializeMarkdownFile(parsed, parsed.doc)).toBe(md);
	});

	it('an untouched save is byte-identical', () => {
		const parsed = parseMarkdownFile(SAMPLE);
		expect(serializeMarkdownFile(parsed, parsed.doc)).toBe(SAMPLE);
	});
});
