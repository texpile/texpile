import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { isMathContext } from '../../../../../../src/lib/editor/extensions/intellisense/completion/mathContext';
import { latexCompletionSource } from '../../../../../../src/lib/editor/extensions/intellisense/completion/dispatch';

const at = (doc: string, pos = doc.length) => isMathContext(EditorState.create({ doc }), pos);

describe('math context detection', () => {
	it('recognizes $...$, \\(...\\), \\[...\\] and math environments', () => {
		expect(at('the sum $x + ')).toBe(true);
		expect(at('inline \\(a')).toBe(true);
		expect(at('display \\[ x')).toBe(true);
		expect(at('\\begin{align}\nx &= ')).toBe(true);
		expect(at('\\begin{equation*}\n')).toBe(true);
	});

	it('recognizes prose, closed math, and escaped dollars as non-math', () => {
		expect(at('plain prose ')).toBe(false);
		expect(at('closed $x$ back to prose ')).toBe(false);
		expect(at('\\begin{align}x\\end{align} after ')).toBe(false);
		expect(at('price is \\$5 and ')).toBe(false);
	});

	it('ignores dollars inside comments', () => {
		expect(at('text % a $ in a comment\nmore ')).toBe(false);
	});
});

describe('math boost through the dispatch', () => {
	const complete = (doc: string) => latexCompletionSource(new CompletionContext(EditorState.create({ doc }), doc.length, false));

	it('vendored tex.json macros are in the pool (\\int, \\par)', async () => {
		const r = await complete('\\');
		const labels = (r?.options ?? []).map((o) => o.label);
		expect(labels).toContain('\\int');
		expect(labels).toContain('\\par');
		expect(labels).toContain('\\lim');
	});

	it('boosts math symbols inside math and sinks them in prose', async () => {
		const inMath = await complete('$ \\i');
		const int = (inMath?.options ?? []).find((o) => o.label === '\\int');
		expect(int?.boost ?? 0).toBeGreaterThan(0);
		const inProse = await complete('prose \\i');
		const intProse = (inProse?.options ?? []).find((o) => o.label === '\\int');
		expect(intProse?.boost ?? 0).toBeLessThan(0);
		// \par is a primitive, not a math symbol: never re-ranked
		const par = (inProse?.options ?? []).find((o) => o.label === '\\par');
		expect(par?.boost ?? 0).toBe(0);
	});
});
