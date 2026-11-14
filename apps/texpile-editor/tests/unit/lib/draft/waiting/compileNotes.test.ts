import { describe, expect, it } from 'vitest';
import { addCompileNotes, compileNoteKind } from '$lib/draft/waiting/compileNotes';

describe('compile notes', () => {
	it('puts pages shipped in a row on one line and keeps the newest lines', () => {
		expect(addCompileNotes(['intro.tex', 'method.tex', '[4]'], ['[5]', 'sae_metrics.tex', '[6]'], 3)).toEqual([
			'[4] [5]',
			'sae_metrics.tex',
			'[6]'
		]);
	});

	it('tells a warning and an error from a file TeX opened', () => {
		expect(compileNoteKind("LaTeX Warning: Citation `chen2024' undefined")).toBe('warning');
		expect(compileNoteKind('! Undefined control sequence.')).toBe('error');
		expect(compileNoteKind('Error.tex')).toBe('plain');
	});
});
