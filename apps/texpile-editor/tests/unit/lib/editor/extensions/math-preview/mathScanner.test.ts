import { describe, it, expect } from 'vitest';
import {
	findMathRegions,
	mathRegionAt,
	type MathRegion
} from '../../../../../../src/lib/editor/source/extensions/math-preview/mathScanner';

const outer = (text: string, regions: MathRegion[]) => regions.map((r) => text.slice(r.from, r.to));
const inner = (text: string, regions: MathRegion[]) => regions.map((r) => text.slice(r.innerFrom, r.innerTo));

describe('findMathRegions', () => {
	it('finds $…$ inline math', () => {
		const text = 'Let $x^2 + y^2 = z^2$ hold.';
		const regions = findMathRegions(text);
		expect(outer(text, regions)).toEqual(['$x^2 + y^2 = z^2$']);
		expect(inner(text, regions)).toEqual(['x^2 + y^2 = z^2']);
		expect(regions[0].kind).toBe('inline');
		expect(regions[0].unclosed).toBeUndefined();
	});

	it('finds $$…$$ display math', () => {
		const text = 'Before $$E = mc^2$$ after';
		const regions = findMathRegions(text);
		expect(outer(text, regions)).toEqual(['$$E = mc^2$$']);
		expect(inner(text, regions)).toEqual(['E = mc^2']);
		expect(regions[0].kind).toBe('display');
	});

	it('finds \\(…\\) and \\[…\\]', () => {
		const text = 'a \\(x+1\\) b \\[\\sum_i a_i\\] c';
		const regions = findMathRegions(text);
		expect(inner(text, regions)).toEqual(['x+1', '\\sum_i a_i']);
		expect(regions.map((r) => r.kind)).toEqual(['inline', 'display']);
	});

	it('finds several regions on one line', () => {
		const text = '$a$ text $b$';
		const regions = findMathRegions(text);
		expect(outer(text, regions)).toEqual(['$a$', '$b$']);
	});

	it('finds math environments, including starred ones', () => {
		const text = 'Intro\n\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}\nand \\begin{equation*}x\\end{equation*}';
		const regions = findMathRegions(text);
		expect(regions).toHaveLength(2);
		expect(regions[0].env).toBe('align');
		expect(regions[0].kind).toBe('display');
		expect(text.slice(regions[0].from, regions[0].to)).toContain('\\end{align}');
		expect(regions[1].env).toBe('equation*');
	});

	it('does not treat \\\\[2pt] as opening display math', () => {
		const text = 'line one \\\\[2pt] line two $x$';
		const regions = findMathRegions(text);
		expect(outer(text, regions)).toEqual(['$x$']);
	});

	it('ignores escaped dollars', () => {
		const text = 'costs \\$5 and $x$';
		const regions = findMathRegions(text);
		expect(outer(text, regions)).toEqual(['$x$']);
	});

	it('ignores math in % comments', () => {
		const text = '% $not math$\nreal $y$';
		const regions = findMathRegions(text);
		expect(outer(text, regions)).toEqual(['$y$']);
	});

	it('handles % comments inside an environment body', () => {
		const text = '\\begin{align}\na &= b % $ not a delimiter\n\\end{align}';
		const regions = findMathRegions(text);
		expect(regions).toHaveLength(1);
		expect(regions[0].env).toBe('align');
		expect(regions[0].unclosed).toBeUndefined();
	});

	it('keeps a $…$ region open across a single newline', () => {
		const text = '$a +\nb$';
		const regions = findMathRegions(text);
		expect(inner(text, regions)).toEqual(['a +\nb']);
		expect(regions[0].unclosed).toBeUndefined();
	});

	it('clamps an unclosed $ at a blank line instead of swallowing the file', () => {
		const text = 'Broken $x + y\n\nNext paragraph with $z$';
		const regions = findMathRegions(text);
		expect(regions).toHaveLength(2);
		expect(regions[0].unclosed).toBe(true);
		expect(inner(text, regions)[0]).toBe('x + y');
		expect(outer(text, regions)[1]).toBe('$z$');
	});

	it('clamps an unclosed region at end of input', () => {
		const text = 'typing $x^2';
		const regions = findMathRegions(text);
		expect(regions).toHaveLength(1);
		expect(regions[0].unclosed).toBe(true);
		expect(inner(text, regions)).toEqual(['x^2']);
	});

	it('marks an unclosed environment', () => {
		const text = '\\begin{align}\na &= b\n\n';
		const regions = findMathRegions(text);
		expect(regions).toHaveLength(1);
		expect(regions[0].env).toBe('align');
		expect(regions[0].unclosed).toBe(true);
	});

	it('does not close on a nested same-name environment boundary', () => {
		// contrived, but the depth counter must not let an inner \end close the outer region early
		const text = '\\begin{equation}\\begin{equation}x\\end{equation}y\\end{equation} tail';
		const regions = findMathRegions(text);
		expect(regions).toHaveLength(1);
		expect(text.slice(regions[0].from, regions[0].to).endsWith('y\\end{equation}')).toBe(true);
	});

	it('treats $ inside \\(…\\) as content, not a delimiter', () => {
		const text = '\\(a $ b\\) $c$';
		const regions = findMathRegions(text);
		expect(inner(text, regions)).toEqual(['a $ b', 'c']);
	});

	it('does not open math for non-math environments', () => {
		const text = '\\begin{itemize}\\item a\\end{itemize}';
		expect(findMathRegions(text)).toEqual([]);
	});

	it('handles CRLF blank lines', () => {
		const text = 'Broken $x\r\n\r\nnext $y$';
		const regions = findMathRegions(text);
		expect(regions[0].unclosed).toBe(true);
		expect(outer(text, regions)[1]).toBe('$y$');
	});
});

describe('mathRegionAt', () => {
	const text = 'Let $x^2$ and \\[y\\] end.';
	const regions = findMathRegions(text);

	it('finds the region containing the position', () => {
		expect(mathRegionAt(regions, text.indexOf('x') + 1)?.kind).toBe('inline');
		expect(mathRegionAt(regions, text.indexOf('y'))?.kind).toBe('display');
	});

	it('includes the position right after the closing delimiter', () => {
		expect(mathRegionAt(regions, text.indexOf('$', 5) + 1)?.kind).toBe('inline');
	});

	it('excludes the position right before the opening delimiter', () => {
		expect(mathRegionAt(regions, text.indexOf('$'))).toBeNull();
	});

	it('returns null outside any region', () => {
		expect(mathRegionAt(regions, 0)).toBeNull();
		expect(mathRegionAt(regions, text.length)).toBeNull();
	});
});
