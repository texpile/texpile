import { describe, expect, it } from 'vitest';
import { EditCheck } from '$lib/draw/editor/state/render/editCheck.svelte';

describe('edit check', () => {
	it('takes back an edit whose drawing has an error the text did not, a second of the same kind among them', () => {
		const check = new EditCheck();
		check.drawn('a', 'a', ['! Undefined control sequence.\nl.3 \\foo'], null);
		check.edited('b', true);
		expect(check.drawn('b', 'b', ['! Undefined control sequence.\nl.3 \\foo'], null)).toBe(0);
		check.edited('c', true);
		check.edited('d', false);
		expect(check.drawn('d', 'd', ['! Undefined control sequence.\nl.3 \\foo', '! Undefined control sequence.\nl.5 \\bar'], null)).toBe(1);
		expect(check.refused).toBe('Undefined control sequence.');
	});

	it('measures an edit against the text as drawn, not a preview of the edit', () => {
		const check = new EditCheck();
		check.drawn('a', 'a', [], null);
		check.drawn('a with a preview', 'a', ['! Missing $ inserted.'], null);
		check.edited('b', true);
		expect(check.drawn('b', 'b', ['! Missing $ inserted.'], null)).toBe(1);
	});
});
