// The line Publish writes for a file left out has to match that one file: not every file of
// that name in every folder, and not whatever a glob character in its name happens to widen it to.
import { it, expect } from 'vitest';
import { ignoreLineFor, withIgnoreLines } from '$lib/workspace/scm/gitignore';

it('anchors the line to the folder, so a file of the same name elsewhere is still seen', () => {
	expect(ignoreLineFor('notes.txt')).toBe('/notes.txt');
	expect(ignoreLineFor('chapters/notes.txt')).toBe('/chapters/notes.txt');
	expect(ignoreLineFor('chapters\\notes.txt')).toBe('/chapters/notes.txt');
});

it('escapes what .gitignore would read as a pattern', () => {
	expect(ignoreLineFor('[draft] v2*.tex')).toBe('/\\[draft] v2\\*.tex');
	expect(ignoreLineFor('what?.md')).toBe('/what\\?.md');
	// a name starting # or ! is safe once anchored: the line starts with the slash
	expect(ignoreLineFor('#scratch.tex')).toBe('/#scratch.tex');
	expect(ignoreLineFor('trailing ')).toBe('/trailing\\ ');
});

it('appends after what is there, and leaves a file that has every line alone', () => {
	expect(withIgnoreLines(null, ['/a.log'])).toBe('/a.log\n');
	expect(withIgnoreLines('*.aux', ['/a.log'])).toBe('*.aux\n\n/a.log\n');
	expect(withIgnoreLines('*.aux\n', ['/a.log', '*.aux'])).toBe('*.aux\n\n/a.log\n');
	expect(withIgnoreLines('*.aux\n/a.log\n', ['# LaTeX', '/a.log'])).toBeNull();
});
