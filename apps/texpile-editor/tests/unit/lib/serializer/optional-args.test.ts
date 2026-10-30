// Arity inference for an unregistered macro stopped at the first `[`, so `\todo[inline]{Fix}` kept
// no argument at all and regenerated as `\todo[inline]Fix`.
import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const rt = (s: string) => serializeToLatex(treeToProseMirror(s).doc);

describe('unknown macros with optional arguments', () => {
	it.each(['\\todo[inline]{Fix this}', '\\SI[per-mode=symbol]{10}{\\metre}', '\\gls[plural]{term}', '\\mycmd[a][b]{c}'])(
		'%s keeps its brackets and braces',
		(call) => {
			expect(rt(`Text ${call} more.`)).toContain(call);
		}
	);

	it('a bracket after a space is prose, not an argument', () => {
		const out = rt('See \\mymark [in brackets] here.');
		expect(out).toContain('\\mymark');
		expect(out).toContain('[in brackets]');
	});
});
