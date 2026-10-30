import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '../../../../src/lib/languages/latex/serializer/latexSerializer';

const parse = (s: string): Node => treeToProseMirror(s, {}).doc;
const rt = (s: string) => serializeToLatex(parse(s));
function has(doc: Node, type: string): boolean {
	let f = false;
	doc.descendants((n) => {
		if (n.type.name === type) f = true;
		return !f;
	});
	return f;
}
function envArgs(doc: Node): string | null {
	let a: string | null = null;
	doc.descendants((n) => {
		if (a === null && n.type.name === 'environment') a = String(n.attrs.args ?? '');
		return a === null;
	});
	return a;
}

describe('environment box keeps its \\begin args', () => {
	it('minipage preserves {width} and round-trips (no longer unwrapped)', () => {
		const src = String.raw`\begin{minipage}{0.5\textwidth}
Hello
\end{minipage}`;
		const doc = parse(src);
		expect(has(doc, 'environment')).toBe(true);
		expect(envArgs(doc)).toBe('{0.5\\textwidth}');
		const out = rt(src);
		expect(out).toContain('\\begin{minipage}{0.5\\textwidth}');
		expect(out).toContain('\\end{minipage}');
		expect(rt(out)).toBe(out); // fixed point
	});

	it('adjustbox keeps its option arg in the args, not the body', () => {
		const out = rt(String.raw`\begin{adjustbox}{width=\textwidth}
Body
\end{adjustbox}`);
		expect(out).toContain('\\begin{adjustbox}{width=\\textwidth}');
		expect(out).not.toContain('width=\\textwidth Body'); // arg must not leak into the body
	});

	it('optional arg: minipage[t]{width}', () => {
		expect(envArgs(parse(String.raw`\begin{minipage}[t]{0.4\linewidth}x\end{minipage}`))).toBe('[t]{0.4\\linewidth}');
	});

	it('an env with no args stays clean (center)', () => {
		expect(envArgs(parse(String.raw`\begin{center}hi\end{center}`))).toBe('');
		expect(rt(String.raw`\begin{center}hi\end{center}`)).toContain('\\begin{center}');
	});
});

describe('an environment written afresh', () => {
	// a \par closing the last paragraph put the end-of-proof square on a line of its own
	it('ends its last paragraph where the environment ends', () => {
		expect(
			rt(String.raw`\begin{proof}
Left to the reader.
\end{proof}`)
		).toBe(String.raw`\begin{proof}
Left to the reader.
\end{proof}`);
	});
});

describe('comments preserved as raw_latex blocks', () => {
	it('standalone comments survive (were dropped before)', () => {
		const src = `First paragraph.

% a standalone comment
%% section divider

Second paragraph.`;
		const doc = parse(src);
		expect(has(doc, 'raw_latex')).toBe(true);
		const out = rt(src);
		expect(out).toContain('% a standalone comment');
		expect(out).toContain('%% section divider');
		expect(out).toContain('First paragraph.');
		expect(out).toContain('Second paragraph.');
		expect(rt(out)).toBe(out); // fixed point
	});

	it('does not split a paragraph: a trailing/mid-prose comment is not block-ified', () => {
		// the % joins the lines in TeX; we must not insert a block between them.
		// the comment text itself is dropped, as before.
		const out = rt(String.raw`Hello world % note
next`);
		expect(out).not.toContain('% note'); // not preserved (would have split the paragraph)
	});
});

describe('\\label is preserved (not dropped)', () => {
	it('a bare label survives as raw so \\ref/\\cref targets are not lost', () => {
		expect(rt(String.raw`\section{S}\label{sec:x}`)).toContain('\\label{sec:x}');
		expect(rt(String.raw`Text \label{foo} more`)).toContain('\\label{foo}');
	});
	it('an equation still captures its own label exactly once (no duplication)', () => {
		const eq = rt(String.raw`\begin{equation}x=1\label{eq:x}\end{equation}`);
		expect((eq.match(/\\label\{eq:x\}/g) || []).length).toBe(1);
	});
});

describe('adversarial edge cases', () => {
	it('minipage signature does not over-grab a body group as an arg', () => {
		const doc = parse(String.raw`\begin{minipage}{0.5\textwidth}{\bf bold} and text\end{minipage}`);
		expect(envArgs(doc)).toBe('{0.5\\textwidth}'); // only the width, not {\bf bold}
		const out = serializeToLatex(doc);
		expect(out).toContain('\\begin{minipage}{0.5\\textwidth}');
		expect(out).toContain('bold');
		expect(out).toContain('and text');
	});

	it('center > minipage nests and round-trips', () => {
		const src = String.raw`\begin{center}
\begin{minipage}{0.5\textwidth}
inner
\end{minipage}
\end{center}`;
		const out = rt(src);
		expect(out).toContain('\\begin{center}');
		expect(out).toContain('\\begin{minipage}{0.5\\textwidth}');
		expect(out).toContain('inner');
		expect(rt(out)).toBe(out); // fixed point
	});

	it('comments at various positions all reach a fixed point and survive', () => {
		const src = `% leading comment
First.

% between paragraphs
Second.

%% trailing divider`;
		const out = rt(src);
		expect(out).toContain('% leading comment');
		expect(out).toContain('% between paragraphs');
		expect(out).toContain('%% trailing divider');
		expect(rt(out)).toBe(out); // idempotent: comment blocks don't compound
	});

	it('consecutive comments each become their own block (no merge/compound)', () => {
		const out = rt(`%a
%b
%c`);
		expect(out).toContain('%a');
		expect(out).toContain('%b');
		expect(out).toContain('%c');
		expect(rt(out)).toBe(out);
	});
});
