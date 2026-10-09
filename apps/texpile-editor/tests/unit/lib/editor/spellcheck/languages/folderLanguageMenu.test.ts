// @vitest-environment jsdom
// Automatic says where its language comes from, so the default in Preferences is not taken for the folder's choice
import { describe, it, expect, beforeEach } from 'vitest';
import { mainFile } from '$lib/workspace/workspaceStore';
import { projectSpelling } from '$lib/workspace/projectConfigSync.svelte';
import { mainFileLanguage, spellingFor } from '$lib/editor/spellcheck/languages/spellingLanguage.svelte';
import { folderLanguageItems } from '$lib/editor/spellcheck/languages/folderLanguageMenu';

beforeEach(() => {
	mainFile.current = null;
	mainFileLanguage.current = undefined;
	projectSpelling.current = null;
});

const automatic = (path: string, source: string) => folderLanguageItems(spellingFor(path, source))[0].label;

describe('the Automatic item', () => {
	it('names the document or the default as its source', () => {
		expect(automatic('/p/main.tex', '\\usepackage[ngerman]{babel}\n\\begin{document}')).toBe('Automatic (German, from the document)');
		expect(automatic('/p/notes.md', '# Notes')).toBe('Automatic (English, the default)');
		expect(automatic('/p/main.tex', '\\usepackage[russian]{babel}')).toBe('Automatic (Russian, not checked)');
	});
});
