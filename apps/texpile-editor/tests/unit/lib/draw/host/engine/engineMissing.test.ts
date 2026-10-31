import { describe, expect, it } from 'vitest';
import { explainDrawError } from '$lib/draw/host/engine/engineMissing';
import { askedProgram } from '$lib/modals/window/missingProgram/missingProgram.svelte';

describe('explainDrawError', () => {
	it('names the missing engine, and opens the dialog for it once', () => {
		const first = explainDrawError(new Error('Error invoking remote method: program missing: lualatex')) as Error;
		expect(first.message).toBe('Figures need LuaLaTeX.');
		expect(askedProgram.current).toBe('lualatex');
		askedProgram.current = null;
		explainDrawError(new Error('program missing: lualatex'));
		expect(askedProgram.current).toBeNull();
		const other = new Error('Undefined control sequence.');
		expect(explainDrawError(other)).toBe(other);
	});
});
