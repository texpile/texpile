import { it, expect } from 'vitest';
import { documentHyphenationLanguage } from '$lib/editor/visual/linebreak/documentHyphenationLanguage';

it('takes the main language babel would: main= first, else the last one listed', () => {
	expect(documentHyphenationLanguage('\\documentclass{article}\n\\usepackage[english,ngerman]{babel}')).toBe('de-1996');
	expect(documentHyphenationLanguage('\\usepackage[main=french,english]{babel}')).toBe('fr');
});

it('reads polyglossia, Typst and Markdown front matter, and asks for no hyphens in a language it has no patterns for', () => {
	expect(documentHyphenationLanguage('\\setmainlanguage{dutch}')).toBe('nl');
	expect(documentHyphenationLanguage('#set text(font: "Libertinus Serif", lang: "pl")')).toBe('pl');
	expect(documentHyphenationLanguage('---\ntitle: Notas\nlang: es\n---\n')).toBe('es');
	expect(documentHyphenationLanguage('\\usepackage[italian]{babel}')).toBe('none');
	expect(documentHyphenationLanguage('#set text(lang: "pt")')).toBe('none');
	expect(documentHyphenationLanguage('no language here')).toBeUndefined();
});

it('reads only the babel line TeX reads, and the class options a bare babel takes its languages from', () => {
	expect(documentHyphenationLanguage('\\documentclass{article}\n% \\usepackage[ngerman]{babel}\n\\usepackage[english]{babel}\n')).toBe(
		'en-us'
	);
	expect(documentHyphenationLanguage('\\documentclass[a4paper,ngerman,11pt]{scrartcl}\n\\usepackage{babel}\n')).toBe('de-1996');
});
