// @vitest-environment jsdom
// the language a file is checked in comes from what the document names, in each of the ways it can name it, and a
// chapter with no preamble takes its main file's
import { describe, it, expect, beforeEach } from 'vitest';
import { declaredLanguage } from '$lib/editor/declaredLanguage';
import { mainFile } from '$lib/workspace/workspaceStore';
import { projectSpelling } from '$lib/workspace/projectConfigSync.svelte';
import { mainFileLanguage, spellingFor, spellLanguageOf } from '$lib/editor/spellcheck/languages/spellingLanguage.svelte';

function languageIn(source: string) {
	const named = declaredLanguage(source);
	return named ? spellLanguageOf(named) : undefined;
}

beforeEach(() => {
	mainFile.current = null;
	mainFileLanguage.current = undefined;
	projectSpelling.current = null;
});

describe('the language a document names', () => {
	it('reads babel, polyglossia, Typst and front matter, variants included', () => {
		expect(languageIn('\\documentclass{article}\n\\usepackage[english,ngerman]{babel}\n\\begin{document}')).toBe('de');
		expect(languageIn('\\documentclass[a4paper,11pt,brazilian]{article}\n\\usepackage{babel}')).toBe('pt-BR');
		expect(languageIn('\\usepackage[main=french,english]{babel}')).toBe('fr');
		expect(languageIn('\\setmainlanguage[variant=brazilian]{portuguese}')).toBe('pt-BR');
		expect(languageIn('\\setdefaultlanguage{portuguese}')).toBe('pt-PT');
		expect(languageIn('#set page(paper: "a4")\n#set text(lang: "pt", region: "br")')).toBe('pt-BR');
		expect(languageIn('#set text(font: "Libertinus Serif", lang: "it")')).toBe('it');
		expect(languageIn('---\ntitle: Notes\nlang: de-CH\n---\n# Notes')).toBe('de');
	});

	it('names a language without a dictionary as null, and a commented-out one not at all', () => {
		expect(languageIn('\\usepackage[russian]{babel}')).toBeNull();
		expect(languageIn('#set text(lang: "ja")')).toBeNull();
		expect(languageIn('% \\usepackage[ngerman]{babel}\n\\begin{document}')).toBeUndefined();
	});
});

describe('which language a file is checked in', () => {
	it('gives a chapter its main file language, but not a file of another kind', () => {
		mainFile.current = '/p/main.tex';
		mainFileLanguage.current = declaredLanguage('\\usepackage[ngerman]{babel}\n\\begin{document}');
		expect(spellingFor('/p/chapters/intro.tex', 'Ein Kapitel.').language).toBe('de');
		expect(spellingFor('/p/README.md', '# Readme').language).toBe('en');
		// the chapter's own declaration wins
		expect(spellingFor('/p/chapters/abstract.tex', '\\selectlanguage{english}\n\\usepackage[french]{babel}').language).toBe('fr');
	});

	it("takes the folder's choice over what the document names, and says what Automatic would pick", () => {
		projectSpelling.current = 'nl';
		expect(spellingFor('/p/main.tex', '\\usepackage[ngerman]{babel}')).toMatchObject({ language: 'nl', automatic: 'de' });
	});
});
