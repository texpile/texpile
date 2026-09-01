// The document's \newcommand definitions on their way to MathLive.
//
// The guard flags are the point. The math node view reads a field back with
// getValue('latex-expanded'), which replaces every macro with its definition, so an unguarded
// dictionary turns \RR into \mathbb{R} in the author's own file the moment they touch an equation.
// Measured against mathlive 0.110: with expand:false, \RR + x survives that round trip; without
// it, it comes back \mathbb{R}+x.
import { describe, it, expect } from 'vitest';
import { guardMacros, macroKey, setMathMacros, mathMacros } from '$lib/editor/visual/extensions/mathlivebridge/mathMacros.svelte';
import { mathMacrosFor } from '$lib/editor/source/extensions/math-preview/userMacros';

describe('macros handed to mathlive', () => {
	it('guards every one of them against being expanded into the document', () => {
		const guarded = guardMacros({
			RR: { def: '\\mathbb{R}', args: 0 },
			vv: { def: '\\mathbf{#1}', args: 1 },
			// arity is optional upstream; a macro without one takes no arguments
			eps: { def: '\\varepsilon' }
		});
		expect(Object.keys(guarded).sort()).toEqual(['RR', 'eps', 'vv']);
		for (const macro of Object.values(guarded)) {
			expect(macro.expand).toBe(false);
			expect(macro.captureSelection).toBe(true);
		}
		// the body passes through untouched, placeholders included
		expect(guarded.vv).toMatchObject({ def: '\\mathbf{#1}', args: 1 });
		expect(guarded.eps.args).toBe(0);
	});

	// re-rendering every equation on screen is the cost of a change, so a keystroke that leaves the
	// definitions alone must not count as one
	it('republishes only when a definition actually changes', () => {
		setMathMacros({ RR: { def: '\\mathbb{R}', args: 0 } });
		expect(setMathMacros({ RR: { def: '\\mathbb{R}', args: 0 } })).toBe(false);
		// same definitions, listed the other way round
		setMathMacros({ RR: { def: '\\mathbb{R}', args: 0 }, ZZ: { def: '\\mathbb{Z}', args: 0 } });
		expect(setMathMacros({ ZZ: { def: '\\mathbb{Z}', args: 0 }, RR: { def: '\\mathbb{R}', args: 0 } })).toBe(false);

		expect(setMathMacros({ RR: { def: '\\mathbb{Q}', args: 0 }, ZZ: { def: '\\mathbb{Z}', args: 0 } })).toBe(true);
		expect(setMathMacros({ RR: { def: '\\mathbb{Q}', args: 0 } })).toBe(true);
		expect(setMathMacros({ RR: { def: '\\mathbb{Q}', args: 1 } })).toBe(true);
	});

	it('publishes what the field will read', () => {
		setMathMacros({ grad: { def: '\\nabla', args: 0 } });
		expect(mathMacros.current.grad).toMatchObject({ def: '\\nabla', expand: false });
	});

	// the whole path the app uses: source text in, dictionary out
	it('reads definitions out of a preamble', () => {
		const guarded = guardMacros(
			mathMacrosFor('\\newcommand{\\RR}{\\mathbb{R}}\n\\newcommand{\\vv}[1]{\\mathbf{#1}}\n\\DeclareMathOperator{\\Tr}{Tr}\n')
		);
		expect(guarded.RR).toMatchObject({ def: '\\mathbb{R}', args: 0, expand: false });
		expect(guarded.vv).toMatchObject({ def: '\\mathbf{#1}', args: 1 });
		expect(guarded.Tr.def).toContain('operatorname');
	});

	it('names a dictionary by what it defines, not by object identity', () => {
		const a = guardMacros({ RR: { def: '\\mathbb{R}', args: 0 } });
		const b = guardMacros({ RR: { def: '\\mathbb{R}', args: 0 } });
		expect(macroKey(a)).toBe(macroKey(b));
		expect(macroKey(a)).not.toBe(macroKey(guardMacros({ RR: { def: '\\mathbb{C}', args: 0 } })));
	});
});
