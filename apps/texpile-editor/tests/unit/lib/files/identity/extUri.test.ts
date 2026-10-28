import { afterEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ isMac: false, isWindows: false }));
vi.mock('$lib/platform', () => platform);

import { extUri } from '$lib/files/identity/extUri';
import { ResourceMap } from '$lib/files/identity/resourceMap';
import { fileUriOf } from '$lib/files/identity/fileUris';

afterEach(() => {
	platform.isMac = false;
	platform.isWindows = false;
});

describe('extUri', () => {
	it('finds a file inside a folder named in another case on Windows, and only on a whole segment', () => {
		platform.isWindows = true;
		expect(extUri.isEqualOrParent(fileUriOf('C:\\Paper\\Chapters\\a.tex'), fileUriOf('c:/paper/chapters'))).toBe(true);
		expect(extUri.isEqualOrParent(fileUriOf('C:\\Paper\\ChaptersOld\\a.tex'), fileUriOf('c:/paper/chapters'))).toBe(false);
		expect(extUri.relativePath(fileUriOf('c:/paper'), fileUriOf('C:\\Paper\\Chapters\\a.tex'))).toBe('Chapters/a.tex');
	});

	it('keys a map by the file, so another spelling finds the entry where the file system folds case', () => {
		const map = new ResourceMap<number>();
		map.set(fileUriOf('/home/l/Notes.tex'), 1);
		expect(map.get(fileUriOf('/home/l/notes.tex'))).toBeUndefined();
		platform.isMac = true;
		const folded = new ResourceMap<number>([[fileUriOf('/Users/l/Notes.tex'), 1]]);
		expect(folded.get(fileUriOf('/Users/l/notes.tex'))).toBe(1);
	});
});
