// enumitem options on the list environment ([resume], [label=(\alph*)], [noitemsep]) were parsed
// as attached arguments and then never emitted, so an edited list silently lost them.
import { describe, it, expect } from 'vitest';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createIndentListCommand, listKeymap } from 'prosemirror-flat-list';
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
		out = out.copy(out.content.replaceChild(out.resolve(at).index(), edited));
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

describe('lists keep the environments the file wrote them in through edits', () => {
	const list = (env: string, opts: string, items: string[]) =>
		`\\begin{${env}}${opts}\n${items.map((w) => `\\item ${w}\n`).join('')}\\end{${env}}`;
	const PAIRS: [string, string, string][] = [
		['enumerate', '[label=a)]', '[label=i)]'],
		['itemize', '', '']
	];

	it('two lists side by side stay two when an item at their meeting point is typed into or the second loses its first', () => {
		for (const [env, a, b] of PAIRS) {
			const parsed = parseLatexFile(file(`${list(env, a, ['one', 'two'])}\n${list(env, b, ['three', 'four'])}`));
			expect(serializeLatexFile(parsed, typedInto(parsed.doc, ['two', 'three']))).toBe(
				file(`${list(env, a, ['one', 'two!'])}\n${list(env, b, ['three!', 'four'])}`)
			);
			const pruned = serializeLatexFile(parsed, withoutItem(parsed.doc, 'three'));
			expect(pruned).toContain(`${list(env, a, ['one', 'two'])}\n`);
			expect(pruned).toContain(`\n${list(env, b, ['four'])}`);
		}
	});

	it('two lists stay two when the paragraph between them is deleted', () => {
		const parsed = parseLatexFile(
			file(`${list('enumerate', '[label=a)]', ['one'])}\n\nBetween.\n\n${list('enumerate', '[label=i)]', ['two'])}`)
		);
		let between = -1;
		parsed.doc.forEach((n, pos) => {
			if (n.type.name === 'paragraph') between = pos;
		});
		const doc = parsed.doc.copy(
			parsed.doc.content.cut(0, between).append(parsed.doc.content.cut(between + parsed.doc.nodeAt(between)!.nodeSize))
		);
		const out = serializeLatexFile(parsed, typedInto(doc, ['one', 'two']));
		expect(out).toContain(`${list('enumerate', '[label=a)]', ['one!'])}`);
		expect(out).toContain(`${list('enumerate', '[label=i)]', ['two!'])}`);
	});

	it('an item Enter splits off stays in its own list', () => {
		const parsed = parseLatexFile(file(`${list('enumerate', '[label=a)]', ['one'])}\n${list('enumerate', '[label=i)]', ['two words'])}`));
		let at = -1;
		parsed.doc.descendants((n, pos) => {
			if (at < 0 && n.isText && n.text === 'two words') at = pos + 'two'.length;
			return at < 0;
		});
		let state = EditorState.create({ doc: parsed.doc, selection: TextSelection.create(parsed.doc, at) });
		expect(listKeymap.Enter(state, (tr) => (state = state.apply(tr)))).toBe(true);
		const out = serializeLatexFile(parsed, typedInto(state.doc, ['one']));
		expect(out).toContain(`${list('enumerate', '[label=a)]', ['one!'])}\n`);
		expect(out).toContain(`\n${list('enumerate', '[label=i)]', ['two', 'words'])}`);
	});

	it('a nested list keeps its options when its first item goes, and a list whose every item was edited keeps its own', () => {
		const nested = parseLatexFile(
			file(
				'\\begin{enumerate}[label=a)]\n\\item one\n\\begin{enumerate}[label=i)]\n\\item inner\n\\item other\n\\end{enumerate}\n\\item two\n\\end{enumerate}'
			)
		);
		const outer = nested.doc.firstChild!;
		const firstInner = outer.child(1);
		const pruned = outer.copy(
			outer.content.cut(0, outer.child(0).nodeSize).append(outer.content.cut(outer.child(0).nodeSize + firstInner.nodeSize))
		);
		const out = serializeLatexFile(nested, nested.doc.copy(nested.doc.content.replaceChild(0, pruned)));
		expect(out).toContain('\\begin{enumerate}[label=i)]\n\\item other\n\\end{enumerate}');

		const desc = parseLatexFile(file('\\begin{description}[style=nextline]\n\\item[A] one\n\\item[B] two\n\\end{description}'));
		expect(serializeLatexFile(desc, typedInto(withoutItem(desc.doc, 'A'), ['B']))).toContain(
			'\\begin{description}[style=nextline]\n\\item[B] two!\n\\end{description}'
		);
	});

	it('a list Tab makes inside an item takes none of the options of the list it came from', () => {
		const parsed = parseLatexFile(file('\\begin{enumerate}[start=3]\n\\item one\n\\item two\n\\end{enumerate}'));
		let at = -1;
		parsed.doc.descendants((n, pos) => {
			if (at < 0 && n.isText && n.text === 'two') at = pos;
			return at < 0;
		});
		let state = EditorState.create({ doc: parsed.doc, selection: TextSelection.create(parsed.doc, at) });
		expect(createIndentListCommand()(state, (tr) => (state = state.apply(tr)))).toBe(true);
		expect(serializeLatexFile(parsed, state.doc)).toContain('\\item one\n\\begin{enumerate}\n\\item two\n\\end{enumerate}');
	});
});
