import { it, expect } from 'vitest';
import { refinedText, refinePrompt } from '$lib/ai/refinePrompt';

const ask = (path: string) => refinePrompt({ ask: 'Shorten it.', path, passage: 'Some words.', before: '', after: '' }).system;

it('tells the agent the format and extension of the file, but not its name or folder', () => {
	const typst = ask('C:/Users/mei/thesis/chapters/results.typ');
	expect(typst).toContain('a passage of a Typst file (.typ)');
	expect(typst).toContain('starting with "- "');
	expect(typst).not.toMatch(/results|thesis|mei/);
	expect(ask('paper/main.tex')).toContain('a LaTeX file (.tex). ');
	expect(ask('paper/main.tex')).toContain('itemize');
	expect(ask('notes.md')).toContain('a Markdown file (.md)');
	expect(ask('refs.bib')).toContain('a BibTeX file (.bib)');
	expect(ask('README')).toContain('a plain text file.');
});

it('keeps the fences of a passage that is a code block, and drops one the agent put around its answer', () => {
	const block = "```python\nprint('hi')\n```";
	expect(refinedText(block, block)).toBe(block);
	expect(refinedText('```latex\nShorter words.\n```', 'Some words.')).toBe('Shorter words.');
});
