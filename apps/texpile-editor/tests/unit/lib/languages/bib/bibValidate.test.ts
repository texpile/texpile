// The warnings an entry would earn from biber, checked against biblatex's own rules.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBibtexRaw } from '$lib/languages/bib/bibtexParser';
import { validateEntry, fieldsForType } from '$lib/languages/bib/bibValidate';
import { BIB_ENTRY_TYPES, BIB_MANDATORY, BIB_UNIVERSAL_FIELDS } from '$lib/languages/bib/bibDatamodel';

const kinds = (p: { kind: string }[]) => p.map((x) => x.kind).sort();

describe('validating a bib entry', () => {
	it('passes a complete article', () => {
		expect(validateEntry('article', ['author', 'journaltitle', 'title', 'year'])).toEqual([]);
	});

	// the expensive one to get wrong: biblatex renames journal to journaltitle on input, so an
	// entry written the BibTeX way is complete, and saying "missing journaltitle" would be a lie
	it('treats a legacy name as the field it becomes, not as a missing one', () => {
		const problems = validateEntry('article', ['author', 'journal', 'title', 'year']);
		expect(kinds(problems)).toEqual(['legacy-field']);
		expect(problems[0]).toMatchObject({ field: 'journal', prefer: 'journaltitle' });
	});

	it('names the fields an entry is missing', () => {
		const problems = validateEntry('article', ['title', 'year']);
		expect(problems).toContainEqual({ kind: 'missing', fields: ['author', 'journaltitle'] });
	});

	it('reads a date as satisfying the year requirement, and both as a conflict', () => {
		expect(validateEntry('book', ['author', 'title', 'date'])).toEqual([]);
		expect(validateEntry('book', ['author', 'title'])).toContainEqual({ kind: 'missing-one-of', fields: ['date', 'year'] });
		expect(validateEntry('book', ['author', 'title', 'date', 'year'])).toContainEqual({
			kind: 'mutually-exclusive',
			fields: ['date', 'year']
		});
	});

	// @online has to be reachable somehow, but biblatex does not care which way
	it('accepts any one of an either-or group', () => {
		expect(validateEntry('online', ['title', 'year', 'url'])).toEqual([]);
		expect(validateEntry('online', ['title', 'year', 'doi'])).toEqual([]);
		expect(validateEntry('online', ['title', 'year'])).toContainEqual({ kind: 'missing-one-of', fields: ['url', 'doi', 'eprint'] });
	});

	it('separates a typo from a field that belongs to another entry type', () => {
		// the typo cost the entry its title, and that is the only reason to mention it
		expect(validateEntry('article', ['author', 'journaltitle', 'titel', 'year'])).toContainEqual({
			kind: 'misspelled-field',
			field: 'titel',
			suggest: 'title'
		});
		// a real biblatex field, but not one @article accepts: biber drops it without a word
		expect(validateEntry('article', ['author', 'journaltitle', 'title', 'year', 'holder'])).toContainEqual({
			kind: 'field-not-for-type',
			field: 'holder',
			entryType: 'article'
		});
	});

	// the export fields every reference manager stamps on an entry; biber ignores them and so do we
	it('stays quiet about fields a reference manager added', () => {
		expect(validateEntry('article', ['author', 'journaltitle', 'title', 'year', 'timestamp', 'biburl', 'bibsource'])).toEqual([]);
		// one letter from `date`, but the entry already has a year, so nothing was lost
		expect(validateEntry('inproceedings', ['author', 'title', 'booktitle', 'year', 'cdate'])).toEqual([]);
	});

	it('flags an entry type biblatex does not define', () => {
		expect(validateEntry('artcle', ['title'])).toContainEqual({ kind: 'unknown-type', entryType: 'artcle' });
	});

	// the app's own bookkeeping travels with a reference and is not part of the entry
	it('ignores the citation key and other internal keys', () => {
		expect(validateEntry('misc', ['key', 'entrytype', 'raw', 'title', 'year'])).toEqual([]);
	});

	it('offers every field the type accepts, its own and the shared ones', () => {
		const fields = fieldsForType('patent');
		expect(fields).toContain('holder'); // @patent's own
		expect(fields).toContain('note'); // shared by every type
		expect(fields).toContain('date'); // a date field, listed nowhere but legal everywhere
		expect(fields).not.toContain('journaltitle'); // @article's
		// an unrecognised type still gets the shared ones, so completion keeps working on a typo
		expect(fieldsForType('nonsense')).toEqual(BIB_UNIVERSAL_FIELDS.toSorted());
	});

	// the generated model is the contract everything else here rests on
	it('carries biblatex whole', () => {
		expect(BIB_ENTRY_TYPES).toContain('software');
		expect(BIB_ENTRY_TYPES.length).toBeGreaterThan(40);
		expect(BIB_MANDATORY.article).toContainEqual({ all: ['author', 'journaltitle', 'title'] });
	});
});

// A bibliography that compiles must not collect warnings, or the reader learns to skip them. This
// is the small always-on version; bib-corpus.stress.test.ts runs the same check over a real arXiv
// corpus when PAPER_DIRS is set.
describe('the validator against a bibliography that compiles', () => {
	const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../live/fixtures/tut/references.bib');

	it.skipIf(!fs.existsSync(file))('reports nothing it cannot stand behind', () => {
		const entries = parseBibtexRaw(fs.readFileSync(file, 'utf8'));
		expect(entries.length).toBeGreaterThan(0);

		const noise: string[] = [];
		for (const entry of entries) {
			for (const p of validateEntry(entry.entryType, Object.keys(entry.entryTags))) {
				if (p.kind === 'unknown-type') noise.push(`${entry.citationKey}: @${p.entryType} unknown`);
				if (p.kind === 'misspelled-field') noise.push(`${entry.citationKey}: "${p.field}" called a typo for "${p.suggest}"`);
			}
		}
		expect(noise).toEqual([]);
	});
});
