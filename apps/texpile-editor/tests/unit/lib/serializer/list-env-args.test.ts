// enumitem options on the list environment ([resume], [label=(\alph*)], [noitemsep]) were parsed
// as attached arguments and then never emitted, so an edited list silently lost them.
import { describe, it, expect } from 'vitest';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import type { Node } from 'prosemirror-model';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

const rt = (s: string) => serializeToLatex(LatexParser.latexToProseMirror(s).doc);

describe('list environment options', () => {
	it.each(['[resume]', '[label=(\\alph*)]', '[noitemsep,topsep=0pt]'])('enumerate%s keeps its options', (opts) => {
		const out = rt(`\\begin{enumerate}${opts}\n\\item one\n\\item two\n\\end{enumerate}`);
		expect(out).toContain(`\\begin{enumerate}${opts}\n`);
		expect(out.split('\\begin{enumerate}').length - 1).toBe(1);
		expect(out.split('\\item').length - 1).toBe(2);
		expect(out).toContain('one');
		expect(out).toContain('two');
	});

	it('a list without options is unchanged', () => {
		const out = rt('\\begin{itemize}\n\\item one\n\\end{itemize}');
		expect(out).toContain('\\begin{itemize}\n\\item');
	});
});

const file = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

function itemAt(doc: Node, words: string): number {
	let at = -1;
	doc.forEach((n, pos) => {
		if (at < 0 && n.type.name === 'list' && n.textContent.startsWith(words)) at = pos;
	});
	return at;
}

function withoutItem(doc: Node, words: string): Node {
	const at = itemAt(doc, words);
	return doc.copy(doc.content.cut(0, at).append(doc.content.cut(at + doc.nodeAt(at)!.nodeSize)));
}

function typedInto(doc: Node, words: string[]): Node {
	let out = doc;
	for (const w of words) {
		const at = itemAt(out, w);
		const item = out.nodeAt(at)!;
		const para = item.firstChild!;
		const edited = item.copy(item.content.replaceChild(0, para.copy(para.content.addToEnd(doc.type.schema.text('!')))));
		out = out.copy(out.content.replaceChild(out.content.findIndex(at).index, edited));
	}
	return out;
}

describe('list environment options once the first item is gone', () => {
	it('the items left open the environment with its options and setup', () => {
		const parsed = parseLatexFile(
			file('Intro.\n\n\\begin{enumerate}[label=(\\alph*)]\n\\setlength\\itemsep{0pt}\n\\item one\n\\item two\n\\end{enumerate}\n\nOutro.')
		);
		const out = serializeLatexFile(parsed, withoutItem(parsed.doc, 'one'));
		expect(out).toContain('\\begin{enumerate}[label=(\\alph*)]\n\\setlength{\\itemsep}{0pt}\n\\item two\n\\end{enumerate}');
	});

	it('two lists side by side stay two, each with its own options', () => {
		for (const [env, a, b] of [
			['enumerate', '[label=a)]', '[label=i)]'],
			['itemize', '', '']
		]) {
			const list = (opts: string, items: string[]) => `\\begin{${env}}${opts}\n${items.map((w) => `\\item ${w}\n`).join('')}\\end{${env}}`;
			const text = file(`${list(a, ['one', 'two', 'three'])}\n${list(b, ['four', 'five', 'six'])}`);
			const parsed = parseLatexFile(text);
			expect(serializeLatexFile(parsed, parsed.doc)).toBe(text);
			expect(serializeLatexFile(parsed, typedInto(parsed.doc, ['two', 'five']))).toBe(
				file(`${list(a, ['one', 'two!', 'three'])}\n${list(b, ['four', 'five!', 'six'])}`)
			);
			expect(serializeLatexFile(parsed, withoutItem(parsed.doc, 'one'))).toBe(
				file(`${list(a, ['two', 'three'])}\n${list(b, ['four', 'five', 'six'])}`)
			);
		}
	});
});
