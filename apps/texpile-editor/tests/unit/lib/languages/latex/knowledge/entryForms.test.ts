import { describe, expect, it } from 'vitest';
import { fieldsOf, formatOf } from '$lib/languages/latex/knowledge/entryForms';

describe('entryForms', () => {
	it('types a verbatim argument between bars', () => {
		const verb = [{ kind: 's' }, { kind: 'v' }];
		expect(formatOf(verb)).toBe('||');
		expect(fieldsOf([{ kind: 'v' }])).toBe('|${1}|');
	});
});
