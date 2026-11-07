import { describe, expect, it } from 'vitest';
import { evaluateWhen, parseWhen, printWhen, WhenSyntaxError } from '$lib/keybindings/when/whenExpression';

describe('when clauses', () => {
	const context: Record<string, string | boolean> = { sourceEditorFocus: true, editorLanguage: 'latex', inputFocus: false };
	const holds = (source: string) => evaluateWhen(parseWhen(source), (k) => context[k]);

	it('evaluates the operators VS Code keybindings use', () => {
		expect(holds('sourceEditorFocus && editorLanguage == latex')).toBe(true);
		expect(holds("editorLanguage != 'typst' && !inputFocus")).toBe(true);
		expect(holds('inputFocus || (sourceEditorFocus && !visualEditorFocus)')).toBe(true);
		expect(holds('!sourceEditorFocus || inputFocus')).toBe(false);
		expect(holds('')).toBe(true);
	});

	it('prints one canonical text for one clause', () => {
		expect(printWhen(parseWhen("a&&(b||c) && d=='x y'"))).toBe("a && (b || c) && d == 'x y'");
		expect(printWhen(parseWhen('!(a && b)'))).toBe('!(a && b)');
	});

	it('rejects a clause that does not parse', () => {
		expect(() => parseWhen('a &&')).toThrow(WhenSyntaxError);
		expect(() => parseWhen('a b')).toThrow(WhenSyntaxError);
		expect(() => parseWhen('(a')).toThrow(WhenSyntaxError);
		expect(() => parseWhen('a == ')).toThrow(WhenSyntaxError);
	});
});
