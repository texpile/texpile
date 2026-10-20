// @vitest-environment jsdom
// definition.ts reaches mathlive, whose browser build touches HTMLElement as it loads
import { describe, it, expect } from 'vitest';
import { findMacroDefinition, includeTargetAt } from '../../../../../../src/lib/languages/latex/intellisense/definition';

describe('go-to-definition helpers', () => {
	it('finds a \\newcommand definition by name', () => {
		const text = 'intro\n\\newcommand{\\foo}{bar text}\nmore \\foo here';
		expect(findMacroDefinition(text, 'foo')).toBe(text.indexOf('\\newcommand'));
	});

	it('finds a \\NewDocumentCommand definition too', () => {
		const text = '\\NewDocumentCommand{\\bar}{m}{#1}';
		expect(findMacroDefinition(text, 'bar')).toBe(0);
	});

	it('does not match a longer macro name and ignores a commented definition', () => {
		expect(findMacroDefinition('\\newcommand{\\foobar}{x}', 'foo')).toBeNull();
		const text = '% \\newcommand{\\foo}{x}\n\\def\\foo{y}';
		expect(findMacroDefinition(text, 'foo')).toBe(text.indexOf('\\def'));
	});

	it('returns null for a macro with no definition in the buffer', () => {
		expect(findMacroDefinition('\\textbf{x}', 'textbf')).toBeNull();
	});

	it('finds an \\input{...} target under the cursor', () => {
		const line = '\\input{chapters/intro}';
		const target = includeTargetAt(line, 0, line.indexOf('intro') + 2);
		expect(target).toEqual(['chapters/intro.tex', 'chapters/intro']);
	});

	it('puts the folder of \\import in front of the file name and reads an unbraced \\input', () => {
		const line = '\\import{parts/}{intro} \\input chap1';
		expect(includeTargetAt(line, 0, line.indexOf('intro'))).toEqual(['parts/intro.tex', 'parts/intro']);
		expect(includeTargetAt(line, 0, line.indexOf('parts'))).toBeNull();
		expect(includeTargetAt(line, 0, line.indexOf('chap1') + 1)).toEqual(['chap1.tex', 'chap1']);
	});

	it('tries only the name with .tex for \\include, which always appends it', () => {
		const line = '\\include{part.one}';
		expect(includeTargetAt(line, 0, line.indexOf('part') + 1)).toEqual(['part.one.tex']);
	});

	it('returns null when the cursor is outside any include macro', () => {
		expect(includeTargetAt('plain text here', 0, 5)).toBeNull();
	});
});
