// Which headings the explorer's Contents lists: the pane stays for every file, so each file must
// say whether it has an outline, and in which editor.
import { describe, expect, it } from 'vitest';
import { tocListOf } from '../../../../src/views/workspace/workspaceToc.svelte';
import { fileKind } from '$lib/workspace/documentBuffer.svelte';

function open(path: string | null, extra: { encodingIssue?: string; conflicted?: boolean; binary?: boolean } = {}) {
	return {
		path,
		kind: fileKind(path),
		encodingIssue: extra.encodingIssue ?? null,
		conflicted: extra.conflicted ?? false,
		binaryWarning: extra.binary && path ? { path, size: 1 } : null
	};
}

describe('tocListOf', () => {
	it('is closed with no file open', () => {
		expect(tocListOf(open(null), 'visual')).toBe('closed');
		expect(tocListOf(open(null), 'source')).toBe('closed');
	});

	it('reads the visual editor for a document in visual mode', () => {
		for (const path of ['/p/main.tex', '/p/doc.typ', '/p/notes.md']) expect(tocListOf(open(path), 'visual')).toBe('visual');
	});

	it('reads the source text for a document in source mode', () => {
		for (const path of ['/p/main.tex', '/p/doc.typ', '/p/notes.md']) expect(tocListOf(open(path), 'source')).toBe('source');
	});

	it('lists nothing for a file without headings, in either mode', () => {
		for (const path of ['/p/refs.bib', '/p/todo.txt', '/p/data.json', '/p/fig.png', '/p/paper.pdf'])
			for (const mode of ['visual', 'source'] as const) expect(tocListOf(open(path), mode)).toBe('none');
	});

	it('follows a file that opens in the source editor whatever the mode', () => {
		expect(tocListOf(open('/p/main.tex', { conflicted: true }), 'visual')).toBe('source');
		expect(tocListOf(open('/p/main.tex', { encodingIssue: 'not UTF-8' }), 'visual')).toBe('source');
	});

	it('lists nothing for a document no editor shows, so the headings of the last file do not stay', () => {
		expect(tocListOf(open('/p/main.tex', { binary: true }), 'visual')).toBe('none');
		expect(tocListOf(open('/p/main.tex'), 'visual', true)).toBe('none');
	});
});
