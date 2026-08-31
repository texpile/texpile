import { describe, expect, it } from 'vitest';
import { decideEdit } from '$lib/draft/heuristics/dispatch';
import { splitParas } from '$lib/draft/heuristics/splitParas';

// Adding a bullet to a list is the commonest structural edit there is, and the live sweeps
// never covered it: the scenario generators skip every line starting with a backslash. Live
// measurement on the torture fixture showed a bare \item dispatching to a full recompile
// (`para-count`), which is the pause a writer feels the moment they press Enter in a list.
const DOC = [
	'\\documentclass{article}',
	'\\begin{document}',
	'Opening prose before the list.',
	'',
	'\\begin{itemize}',
	'\\item First bullet with text.',
	'\\item Second bullet with text.',
	'\\end{itemize}',
	'',
	'Closing prose after the list.',
	'\\end{document}',
	''
].join('\n');

const after = (line: string, add: string) => DOC.replace(line, line + '\n' + add);

describe('splitParas on a bare \\item', () => {
	it('opens a paragraph for an \\item with no text yet', () => {
		// it used to open none, and that is WHY a typed bullet went to the full pass: both
		// sides split to the same paragraphs, so the edit read as a bare buffer difference
		const withBare = after('\\item First bullet with text.', '\\item');
		expect(splitParas(withBare).length).toBe(splitParas(DOC).length + 1);
		expect(splitParas(withBare).filter((p) => p.text === '' && p.wrap === 'itemize')).toHaveLength(1);
	});

	it('keeps the list wrap when an item writes its text on the next line', () => {
		const split = splitParas(DOC.replace('\\item First bullet with text.', '\\item\n  First bullet with text.'));
		expect(split.find((p) => p.text.includes('First bullet'))?.wrap).toBe('itemize');
	});
});

describe('decideEdit while typing a new bullet', () => {
	it('carries a new bullet WITH text on the merged item run', () => {
		const d = decideEdit(DOC, after('\\item First bullet with text.', '\\item A third bullet.'));
		expect(d.kind).toBe('patch');
	});

	it('carries a bare \\item the moment Enter is pressed', () => {
		// the auto-insert path: CodeMirror supplies "\item " and the user has typed nothing
		const d = decideEdit(DOC, after('\\item First bullet with text.', '\\item'));
		expect(d.kind).toBe('patch');
	});

	it('carries "\\item " with the trailing space the editor inserts', () => {
		const d = decideEdit(DOC, after('\\item First bullet with text.', '\\item '));
		expect(d.kind).toBe('patch');
	});
});
