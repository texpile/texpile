import { describe, expect, it } from 'vitest';
import { parsedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { packageTableOf } from '$lib/languages/latex/parser/signatures/packageTable';
import { preambleFields, replacePreambleSpan, spanOf } from '$lib/languages/latex/visual/core/title/preambleFields';

const preamble = String.raw`\documentclass{revtex4-1}
% \affiliation{Not this one}
\newcommand{\setup}{\email{hidden@example.org}}
\title[Short]{A \textbf{rich} title}
\author{Ada}
\affiliation{Engines,
  London}
\email[Mail]{ada@example.org}
\begin{document}`;

describe('the title block in a preamble', () => {
	it('lists the commands that set it, in order, and none from a comment or a definition', async () => {
		const table = packageTableOf(await parsedPackages(preamble));
		const fields = preambleFields(preamble, table);
		expect(fields.map((field) => [field.name, field.part])).toEqual([
			['title', 'title'],
			['author', 'author'],
			['affiliation', 'affiliation'],
			['email', 'email']
		]);
		expect(preamble.slice(fields[2].bodyFrom, fields[2].bodyTo)).toBe('Engines,\n  London');
	});

	it('replaces the text of one field and leaves every other byte as written', async () => {
		const table = packageTableOf(await parsedPackages(preamble));
		const span = spanOf(preamble, preambleFields(preamble, table)[2]);
		expect(replacePreambleSpan(preamble, span, 'Analytical Engines')).toBe(preamble.replace('Engines,\n  London', 'Analytical Engines'));
	});

	// typed into the panel one key at a time, `\And` ends in `\` for a moment, which reads as escaping the closing brace
	it('keeps the bytes after a field while its text ends in a backslash', async () => {
		const table = packageTableOf(await parsedPackages(preamble));
		const span = spanOf(preamble, preambleFields(preamble, table)[2]);
		const halfTyped = replacePreambleSpan(preamble, span, 'Engines \\');
		expect(replacePreambleSpan(halfTyped, span, 'Engines \\And')).toBe(preamble.replace('Engines,\n  London', 'Engines \\And'));
	});
});
