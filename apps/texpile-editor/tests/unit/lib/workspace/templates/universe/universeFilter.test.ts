// The Typst template gallery's search, over a slice of the real list.
import { describe, expect, it } from 'vitest';
import { filterUniverse } from '$lib/workspace/templates/universe/universeFilter';
import type { UniverseTemplate } from '$lib/workspace/templates/templateBridge.types';

function t(name: string, description: string, extra: Partial<UniverseTemplate> = {}): UniverseTemplate {
	return { name, version: '1.0.0', description, authors: [], keywords: [], categories: [], thumbnail: false, ...extra };
}

const LIST = [
	t('charged-ieee', 'An IEEE-style paper template to publish at conferences', { keywords: ['ieee', 'paper'], categories: ['paper'] }),
	t('modern-cv', 'A modern resume template', { authors: ['DeveloperPaul123'], categories: ['cv'] }),
	t('touying-aqua', 'Slides in the Aqua theme', { categories: ['presentation'] }),
	t('ieee-letter', 'A letter for IEEE correspondence', { categories: ['office'] }),
	t('thesis-kit', 'Write your thesis with a paper-like layout', { categories: ['thesis'] })
];

const names = (query: string) => filterUniverse(LIST, query).map((x) => x.name);

describe('filterUniverse', () => {
	it('lists everything, in order, for an empty query', () => {
		expect(names('   ')).toEqual(LIST.map((x) => x.name));
	});

	it('ranks a name match above a tag or description match', () => {
		expect(names('ieee')).toEqual(['ieee-letter', 'charged-ieee']);
		expect(names('paper')).toEqual(['charged-ieee', 'thesis-kit']);
	});

	it('needs every word to match somewhere', () => {
		expect(names('ieee letter')).toEqual(['ieee-letter']);
		expect(names('ieee cv')).toEqual([]);
	});

	it('finds categories and authors, ignoring case', () => {
		expect(names('Presentation')).toEqual(['touying-aqua']);
		expect(names('paul')).toEqual(['modern-cv']);
	});
});
