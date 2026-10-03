// Linux file systems tell Notes.tex and notes.tex apart; NTFS and APFS (by default) do not
import { describe, it, expect, vi, afterEach } from 'vitest';

const platform = vi.hoisted(() => ({ isMac: false, isWindows: false }));
vi.mock('$lib/platform', () => platform);

import { samePath } from '$lib/workspace/fileSystem';

describe('samePath', () => {
	afterEach(() => {
		platform.isMac = false;
		platform.isWindows = false;
	});

	it('tells apart two names that differ only in case on Linux', () => {
		expect(samePath('/home/l/paper/Notes.tex', '/home/l/paper/notes.tex')).toBe(false);
		expect(samePath('/home/l/paper\\notes.tex', '/home/l/paper/notes.tex')).toBe(true);
	});

	it('ignores case on Windows and macOS', () => {
		platform.isWindows = true;
		expect(samePath('C:\\ws\\Notes.tex', 'c:/WS/notes.tex')).toBe(true);
		platform.isWindows = false;
		platform.isMac = true;
		expect(samePath('/Users/l/paper/Notes.tex', '/Users/l/paper/notes.tex')).toBe(true);
	});
});
