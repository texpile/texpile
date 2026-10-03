// The dialog for a typesetter's missing program, asked for where the need came up; anything else is the caller's to say
import { describe, it, expect, beforeEach } from 'vitest';
import { askForProgram, askedProgram, familyOf, tinymistMissing } from '$lib/modals/window/missingProgram/missingProgram.svelte';

beforeEach(() => {
	askedProgram.current = null;
	tinymistMissing.current = false;
});

describe('missing programs', () => {
	it('knows which typesetter each program belongs to', () => {
		expect(familyOf('tinymist')).toBe('typst');
		expect(familyOf('latexmk')).toBe('latex');
		expect(familyOf('synctex')).toBe('latex');
		expect(familyOf('gs')).toBeNull();
	});

	it('opens the dialog for a typesetter program, and marks tinymist missing for the bar and the preview', () => {
		expect(askForProgram('tinymist')).toBe(true);
		expect(askedProgram.current).toBe('tinymist');
		expect(tinymistMissing.current).toBe(true);
		expect(askForProgram('latexindent')).toBe(true);
		expect(askedProgram.current).toBe('latexindent');
	});

	it('leaves a helper it cannot show a row for to the caller', () => {
		expect(askForProgram('inkscape')).toBe(false);
		expect(askedProgram.current).toBeNull();
	});
});
