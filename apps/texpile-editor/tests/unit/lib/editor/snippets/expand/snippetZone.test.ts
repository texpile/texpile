import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { snippetZoneAt } from '$lib/editor/snippets/expand/snippetZone';
import type { SnippetLanguage } from '$lib/editor/snippets/file/snippetTypes';

// ‸ marks the position asked about
function zoneAt(lang: SnippetLanguage, withCaret: string): string | null {
	const at = withCaret.indexOf('‸');
	return snippetZoneAt(EditorState.create({ doc: withCaret.replace('‸', '') }), at, lang)?.zone ?? null;
}

describe('snippet zones in code', () => {
	it('LaTeX verbatim, \\verb and \\lstinline take no snippet, and their $ opens no math', () => {
		expect(zoneAt('latex', '\\begin{verbatim}\n$x‸$\n\\end{verbatim}')).toBeNull();
		expect(zoneAt('latex', 'see \\verb|$a‸$| and')).toBeNull();
		expect(zoneAt('latex', 'see \\lstinline{a‸} and')).toBeNull();
		expect(zoneAt('latex', '\\lstinline|$a| and $b‸$')).toBe('math');
	});

	it('Markdown code takes no snippet, and a $ in it or in a price leaves the text as text', () => {
		expect(zoneAt('markdown', '```sh\necho $x‸\n```')).toBeNull();
		expect(zoneAt('markdown', 'Run `a‸b` first')).toBeNull();
		expect(zoneAt('markdown', 'Run `cd $HOME` and then‸ go')).toBe('text');
		expect(zoneAt('markdown', 'It costs $5 and\nthen‸ more')).toBe('text');
		expect(zoneAt('markdown', 'so $a +\nb‸$ holds')).toBe('math');
	});
});
