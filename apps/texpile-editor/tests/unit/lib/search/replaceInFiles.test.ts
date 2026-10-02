import { describe, expect, it, vi } from 'vitest';
import {
	ChangedSinceError,
	matcher,
	replaceEdits,
	replaceInFiles,
	replaceInText,
	type ReplaceDeps,
	type ReplaceSpec
} from '$lib/search/replaceInFiles';
import { changedSpan } from '$lib/workspace/edits/openEditorEdit';

const plain = (query: string, replacement: string, caseSensitive = false): ReplaceSpec => ({
	query,
	replacement,
	regex: false,
	caseSensitive
});
const regex = (query: string, replacement: string): ReplaceSpec => ({ query, replacement, regex: true, caseSensitive: true });

describe('replaceInText', () => {
	it('replaces a plain string everywhere, folding case unless asked not to', () => {
		expect(replaceInText('Fig. 1 and fig. 2\nFIG. 3', plain('fig.', 'Figure'))).toEqual({
			text: 'Figure 1 and Figure 2\nFigure 3',
			count: 3
		});
		expect(replaceInText('Fig. 1 and fig. 2', plain('fig.', 'Figure', true))).toEqual({ text: 'Fig. 1 and Figure 2', count: 1 });
	});

	it('takes a plain replacement literally, $ signs and all', () => {
		expect(replaceInText('cost: X', plain('X', '$&100')).text).toBe('cost: $&100');
	});

	it("gives a regex replacement its groups, the way the search's own regex matched", () => {
		expect(replaceInText('\\ref{fig:a} and \\ref{fig:b}', regex('\\\\ref\\{(fig:\\w+)\\}', '\\cref{$1}'))).toEqual({
			text: '\\cref{fig:a} and \\cref{fig:b}',
			count: 2
		});
	});

	it('matches line by line, as the search listed them', () => {
		// ^ is each line's start, and nothing matches across a line break
		expect(replaceInText('a\nb', regex('^', '> '))).toEqual({ text: '> a\n> b', count: 2 });
		expect(replaceInText('end of\nline', plain('of\nline', 'x'))).toEqual({ text: 'end of\nline', count: 0 });
	});

	it('lists each match as its own edit, worked out with the line around it', () => {
		const text = 'see Fig. 1\nand Fig. 2';
		expect(replaceEdits(text, regex('(?<=see )Fig\\. (\\d)', 'Figure $1'))).toEqual([{ from: 4, to: 10, insert: 'Figure 1' }]);
		expect(replaceEdits(text, regex('Fig\\. (?<n>\\d)', '[$<n>]'))).toEqual([
			{ from: 4, to: 10, insert: '[1]' },
			{ from: 15, to: 21, insert: '[2]' }
		]);
	});

	it('changes nothing for an empty query or an invalid pattern', () => {
		expect(matcher(plain('', 'x'))).toBeNull();
		expect(matcher(regex('(', 'x'))).toBeNull();
		expect(replaceInText('text', regex('(', 'x'))).toEqual({ text: 'text', count: 0 });
	});
});

describe('changedSpan', () => {
	it('is the one range between the shared start and end', () => {
		expect(changedSpan('see Fig. 1 here', 'see Figure 1 here')).toEqual({ from: 7, to: 8, insert: 'ure' });
		expect(changedSpan('aaa', 'aaaa')).toEqual({ from: 3, to: 3, insert: 'a' });
		expect(changedSpan('same', 'same')).toEqual({ from: 4, to: 4, insert: '' });
	});
});

function folder(files: Record<string, string>, open: { path: string; text: string } | null = null) {
	const disk = new Map(Object.entries(files));
	const editor = open ? { ...open } : null;
	const deps: ReplaceDeps = {
		open: () => (editor ? { path: editor.path, text: editor.text, eol: '\n' } : null),
		applyToOpen: vi.fn(async (before: string, next: string) => {
			if (!editor || editor.text !== before) return false;
			editor.text = next;
			return true;
		}),
		flush: vi.fn(async () => {}),
		read: async (path) => {
			const text = disk.get(path);
			if (text === undefined) throw new Error(`ENOENT ${path}`);
			return { text, encoding: path.endsWith('.latin1.tex') ? 'other' : 'utf8' };
		},
		write: vi.fn(async (path: string, text: string) => void disk.set(path, text)),
		encodingError: (e) => (e === 'other' ? 'not UTF-8' : null),
		changed: vi.fn()
	};
	return { disk, editor, deps };
}

describe('replaceInFiles', () => {
	const spec = plain('colour', 'color');

	it('rewrites the files on disk in their own line endings, and the open file through its editor', async () => {
		const { disk, editor, deps } = folder(
			{ '/p/a.tex': 'colour\r\nno match\r\ncolour', '/p/main.tex': 'on disk, stale' },
			{ path: '/p/main.tex', text: 'the colour of it' }
		);
		const out = await replaceInFiles(['/p/a.tex', '/p/main.tex'], spec, deps);
		expect(out).toMatchObject({ files: 2, matches: 3, skipped: [] });
		expect(disk.get('/p/a.tex')).toBe('color\r\nno match\r\ncolor');
		expect(editor!.text).toBe('the color of it');
		// the open file is never written behind its editor
		expect(disk.get('/p/main.tex')).toBe('on disk, stale');
		expect(deps.flush).toHaveBeenCalled();
		expect(deps.changed).toHaveBeenCalledTimes(1);
	});

	it('leaves a file that is not UTF-8, one the editor would not take, and one that could not be read', async () => {
		const { deps } = folder({ '/p/old.latin1.tex': 'colour' }, { path: '/p/main.tex', text: 'colour' });
		vi.mocked(deps.applyToOpen).mockResolvedValue(false);
		const out = await replaceInFiles(['/p/old.latin1.tex', '/p/main.tex', '/p/gone.tex'], spec, deps);
		expect(out.files).toBe(0);
		expect(out.skipped).toEqual([
			{ path: '/p/old.latin1.tex', reason: 'encoding' },
			{ path: '/p/main.tex', reason: 'editor' },
			{ path: '/p/gone.tex', reason: 'failed' }
		]);
		expect(out.undo).toBeNull();
		expect(deps.changed).not.toHaveBeenCalled();
	});

	it('takes the whole replace back, and redoes it', async () => {
		// a file that mixes CRLF and LF lines keeps each line's own ending, both ways
		const mixed = 'colour\nplain\r\ncolour\r\nend\n';
		const { disk, editor, deps } = folder({ '/p/a.tex': 'colour\r\n', '/p/mixed.tex': mixed }, { path: '/p/main.tex', text: 'colour' });
		const out = await replaceInFiles(['/p/a.tex', '/p/mixed.tex', '/p/main.tex'], spec, deps);
		expect(disk.get('/p/mixed.tex')).toBe('color\nplain\r\ncolor\r\nend\n');
		await out.undo!();
		expect(disk.get('/p/mixed.tex')).toBe(mixed);
		expect(disk.get('/p/a.tex')).toBe('colour\r\n');
		expect(editor!.text).toBe('colour');
		await out.redo!();
		expect(disk.get('/p/a.tex')).toBe('color\r\n');
		expect(editor!.text).toBe('color');
	});

	it('says what it is about to change in a file that is not open, before writing it, and on undo', async () => {
		const { disk, deps } = folder({ '/p/a.tex': 'the colour' }, { path: '/p/main.tex', text: 'colour' });
		const seen: unknown[] = [];
		deps.edited = vi.fn(async (...args) => {
			seen.push([...args, disk.get('/p/a.tex')]);
			return 'suggesting' as const;
		});
		const out = await replaceInFiles(['/p/a.tex', '/p/main.tex'], spec, deps);
		// once, for the file on disk only, while it still held its old text
		expect(seen).toEqual([['/p/a.tex', 'the colour', 'the color', [{ from: 4, to: 10, insert: 'color' }], 'the colour']]);
		await out.undo!();
		// with the mode the change was carried in
		expect(seen[1]).toEqual(['/p/a.tex', 'the color', 'the colour', [{ from: 4, to: 9, insert: 'colour' }], 'suggesting', 'the color']);
	});

	it('refuses to undo, changing nothing, when a file was edited after the replace', async () => {
		const { disk, deps } = folder({ '/p/a.tex': 'colour', '/p/b.tex': 'colour' });
		const out = await replaceInFiles(['/p/a.tex', '/p/b.tex'], spec, deps);
		disk.set('/p/b.tex', 'color, then more writing');
		await expect(out.undo!()).rejects.toThrow(ChangedSinceError);
		expect(disk.get('/p/a.tex')).toBe('color');
		expect(disk.get('/p/b.tex')).toBe('color, then more writing');
	});
});
