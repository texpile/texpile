import { describe, expect, it } from 'vitest';
import { JsExpression, JsRegex, readJsLiteral } from '$lib/editor/snippets/import/jsLiteral';

describe('reading a snippet file as literals', () => {
	it('skips comments, regexes and templates inside a function and braces in a header comment', () => {
		const src = String.raw`// snippets {v2}
/* [old] */
export default [
	{trigger: /x(\d)/, replacement: (match) => {
		// don't touch the quote's case
		const s = match[1].replace(/'/g, "").replace(/[/}]/g, '');
		return ${'`'}\\frac{${'${'}s}{${'${'}{ a: '}' }.a}}${'`'};
	}, options: "mA"},
	{trigger: "mk", replacement: "$$0$", options: "tA"},
]`;
		const [first, second] = readJsLiteral(src) as Record<string, unknown>[];
		expect(first.trigger).toEqual(new JsRegex(String.raw`x(\d)`, ''));
		expect(first.replacement).toBeInstanceOf(JsExpression);
		expect((first.replacement as JsExpression).text).toMatch(/^\(match\) => \{[\s\S]*\}$/);
		expect(first.options).toBe('mA');
		expect(second).toEqual({ trigger: 'mk', replacement: '$$0$', options: 'tA' });
	});
});
