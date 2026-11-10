import { expect, it } from 'vitest';
import { parseAtsutil, parseFamilyLines, parseFcList } from '../../../../../electron/src/fonts/installedFonts';
import { textFontValue, themeFontName } from '../../../src/lib/chrome/editorTextFont';

it('reads family names from each platform listing', () => {
	expect(parseFcList('DejaVu Sans,DejaVu Sans Bold\nNoto Serif\nNoto Serif\n.Hidden\n')).toEqual(['DejaVu Sans', 'Noto Serif']);
	expect(parseFamilyLines('Segoe UI\r\nArial\r\nArial\r\n')).toEqual(['Arial', 'Segoe UI']);
	const ats = 'System Fonts:\n\tAcademyEngravedLetPlain\n\tAlBayan\nSystem Families:\n\tAl Nile\n\tAcademy Engraved LET\n\tAl Nile\n';
	expect(parseAtsutil(ats)).toEqual(['Academy Engraved LET', 'Al Nile']);
});

it('writes the chosen font over the theme font and names a theme font', () => {
	expect(textFontValue('Palatino "Linotype"')).toBe('"Palatino Linotype", var(--typo-base--font-family)');
	expect(themeFontName("'Inter', system-ui, sans-serif")).toBe('Inter');
	expect(themeFontName('system-ui')).toBe('');
});
