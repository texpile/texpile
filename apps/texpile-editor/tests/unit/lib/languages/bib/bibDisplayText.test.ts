// citation chips and the bib list showed the raw field: M{\"u}ller, {Knuth}, Kn\"{u}th
import { describe, it, expect } from 'vitest';
import { bibDisplayText } from '$lib/languages/bib/bibDisplayText';

describe('bibDisplayText', () => {
	it.each([
		['M{\\"u}ller', 'Müller'],
		['Kn\\"{u}th and G\\\'{o}mez', 'Knüth and Gómez'],
		['{\\v{C}}apek', 'Čapek'],
		["Erd\\H{o}s, P\\'al", 'Erdős, Pál'],
		['Stra{\\ss}e \\& {\\o}', 'Straße & ø'],
		['{The {LaTeX} Companion}', 'The LaTeX Companion'],
		['Knuth,~D.~E.', 'Knuth, D. E.'],
		['Na\\"{\\i}ve \\LaTeX\\ pages 1\\textendash 5, a\\_b', 'Naïve LaTeX\\ pages 1–5, a_b'],
		['line\\\\ss', 'line\\\\ss']
	])('%s reads as %s', (raw, shown) => {
		expect(bibDisplayText(raw)).toBe(shown);
	});

	it('leaves plain text alone', () => {
		expect(bibDisplayText('Donald E. Knuth')).toBe('Donald E. Knuth');
		expect(bibDisplayText(undefined)).toBe('');
	});
});

import { bibAuthorShort } from '$lib/languages/bib/bibDisplayText';

describe('bibAuthorShort', () => {
	it.each([
		['Knuth, Donald E.', 'Knuth'],
		['Donald E. Knuth', 'Knuth'],
		['Lamport, Leslie and M{\\"u}ller, J{\\"o}rg', 'Lamport and Müller'],
		['A, X and B, Y and C, Z', 'A et al.'],
		['Smith, J. and others', 'Smith et al.']
	])('%s shows as %s', (raw, shown) => {
		expect(bibAuthorShort(raw)).toBe(shown);
	});
});
