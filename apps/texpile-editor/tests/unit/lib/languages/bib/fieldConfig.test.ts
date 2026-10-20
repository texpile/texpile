import { describe, it, expect } from 'vitest';
import { getFieldsForType } from '../../../../../src/lib/languages/bib/fieldConfig';
import { schemaForType } from '../../../../../src/lib/languages/bib/schema';

describe('required fields in the form', () => {
	it('stars the field the save rule asks for when a one-of rule has an input', () => {
		const starred = getFieldsForType('article')
			.filter((f) => f.required)
			.map((f) => f.name);
		expect(starred).toContain('year');
		const entry = { key: 'k', entrytype: 'article', author: 'A', title: 'T', journaltitle: 'J' };
		expect(schemaForType('article').safeParse(entry).success).toBe(false);
	});
});
