import { afterEach, expect, it } from 'vitest';
import { packagesWithoutData } from '$lib/editor/snippets/file/packagesWithoutData';
import { parsePackageFile, setUserFiles } from '$lib/languages/latex/knowledge/userFiles';

afterEach(() => setUserFiles(new Map()));

it('lists a package with no data and leaves out a bundled one and one with a package file', () => {
	setUserFiles(new Map([['review', [parsePackageFile('{ "version": 1, "macros": [{ "name": "offen" }] }').contents!]]]));
	expect(packagesWithoutData('\\usepackage{zzqaunknownpkg}\n\\usepackage{amsmath}\n\\usepackage{review}\n')).toEqual(['zzqaunknownpkg']);
});
