import { describe, expect, it } from 'vitest';
import {
	bibStyleNames,
	readBibliography,
	writeBibliography
} from '$lib/languages/latex/visual/extensions/drawn/settings/bibliographyCommand';

describe('bibliographyCommand', () => {
	it('changes the argument in place and keeps the rest', () => {
		const command = readBibliography('\\bibliographystyle{plain}')!;
		expect(command).toEqual({ style: true, value: 'plain' });
		expect(writeBibliography('\\bibliographystyle{plain}', command.value)).toBe('\\bibliographystyle{plain}');
		expect(writeBibliography('\\bibliography{refs,more}', 'refs')).toBe('\\bibliography{refs}');
	});

	it('offers the styles the registry holds, each once', () => {
		const names = bibStyleNames([]);
		expect(names).toEqual(expect.arrayContaining(['plain', 'IEEEtran', 'plainnat']));
		expect(new Set(names).size).toBe(names.length);
		expect(names.length).toBeGreaterThan(12);
	});

	it('puts BibTeX\u2019s own styles ahead of the other packages\u2019', () => {
		expect(bibStyleNames([]).slice(0, 8)).toEqual(expect.arrayContaining(['plain', 'unsrt', 'alpha', 'abbrv']));
	});
});
