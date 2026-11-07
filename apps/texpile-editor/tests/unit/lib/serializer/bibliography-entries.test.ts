// thebibliography was a raw chip because its facts give an item command; its entries are list items that keep their key
import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { enterKeepingListEnvironment } from '$lib/languages/latex/visual/listEnterKeepsEnvironment';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

const BIB = `\\begin{thebibliography}{99}
\\bibitem[Knuth(1968)]{knuth} D. Knuth. \\emph{The Art of Computer Programming}. 1968.
\\bibitem{lamport} L. Lamport. 1986.
\\end{thebibliography}`;

const file = (body: string) => `\\documentclass{article}\n\\begin{document}\nIntro.\n\n${body}\n\\end{document}\n`;

function entryAt(doc: Node, words: string): number {
	let at = -1;
	doc.forEach((n, pos) => {
		if (at < 0 && n.type.name === 'list' && n.textContent.includes(words)) at = pos;
	});
	return at;
}

describe('thebibliography', () => {
	it('opens as entries with their keys, saves untouched byte for byte and writes an edited entry as \\bibitem[label]{key} text', () => {
		const text = file(BIB);
		const parsed = parseLatexFile(text);
		const keys: string[] = [];
		parsed.doc.forEach((n) => {
			if (n.type.name === 'list') keys.push(`${n.attrs.itemKey}|${n.attrs.itemLabel}`);
		});
		expect(keys).toEqual(['knuth|Knuth(1968)', 'lamport|null']);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(text);
		const at = entryAt(parsed.doc, 'Knuth');
		const item = parsed.doc.nodeAt(at)!;
		const paragraph = item.firstChild!;
		const edited = item.copy(
			item.content.replaceChild(0, paragraph.copy(paragraph.content.addToEnd(parsed.doc.type.schema.text(' Reprint.'))))
		);
		const doc = parsed.doc.copy(parsed.doc.content.replaceChild(parsed.doc.resolve(at).index(), edited));
		const out = serializeLatexFile(parsed, doc);
		expect(out).toContain('\\begin{thebibliography}{99}\n\\bibitem[Knuth(1968)]{knuth} D. Knuth.');
		expect(out).toContain('1968. Reprint.');
		expect(out).toContain('\\bibitem{lamport} L. Lamport. 1986.\n\\end{thebibliography}');
	});

	it('starts a new entry with an empty key when Enter ends an entry', () => {
		const parsed = parseLatexFile(file(BIB));
		const at = entryAt(parsed.doc, 'Lamport');
		const end = at + parsed.doc.nodeAt(at)!.nodeSize - 2;
		let state = EditorState.create({ doc: parsed.doc, selection: TextSelection.create(parsed.doc, end) });
		expect(enterKeepingListEnvironment(state, (tr) => (state = state.apply(tr)))).toBe(true);
		const out = serializeLatexFile(parsed, state.doc);
		expect(out).toContain('\\bibitem{lamport} L. Lamport. 1986.\n\\bibitem{}');
		expect(out.split('\\begin{thebibliography}').length).toBe(2);
	});

	it('keeps the entry Enter makes at the start of the first entry in the bibliography', () => {
		const parsed = parseLatexFile(file(BIB));
		const at = entryAt(parsed.doc, 'Knuth');
		let state = EditorState.create({ doc: parsed.doc, selection: TextSelection.create(parsed.doc, at + 2) });
		expect(enterKeepingListEnvironment(state, (tr) => (state = state.apply(tr)))).toBe(true);
		const out = serializeLatexFile(parsed, state.doc);
		expect(out).toContain('Intro.\n\n\\begin{thebibliography}{99}\n\\bibitem{}');
		expect(out).not.toContain('itemize');
	});

	it.each([
		['itemize', null, '\\begin{itemize}\n\\item New\n\\end{itemize}\n'],
		['description', 'description', '\\begin{description}\n\\item New\n\\end{description}\n']
	])('writes a %s list made before the bibliography as its own environment', (_name, envName, written) => {
		const parsed = parseLatexFile(file(BIB));
		const { schema } = parsed.doc.type;
		const attrs = { kind: 'bullet', order: null, checked: null, collapsed: false, envName };
		const list = schema.nodes.list.create(attrs, schema.nodes.paragraph.create(null, schema.text('New')));
		const at = entryAt(parsed.doc, 'Knuth');
		const doc = parsed.doc.type.create(parsed.doc.attrs, parsed.doc.content.cut(0, at).addToEnd(list).append(parsed.doc.content.cut(at)));
		const out = serializeLatexFile(parsed, doc);
		expect(out).toContain(`${written}\n\\begin{thebibliography}{99}\n\\bibitem[Knuth(1968)]{knuth}`);
	});

	it('reads \\item entries in a bibliography and \\bibitem entries in another list as entries', () => {
		for (const body of [
			'\\begin{thebibliography}{99}\n\\item D. Knuth. 1968.\n\\item L. Lamport. 1986.\n\\end{thebibliography}',
			'\\begin{description}\n\\bibitem{knuth} D. Knuth. 1968.\n\\bibitem{lamport} L. Lamport. 1986.\n\\end{description}'
		]) {
			const text = file(body);
			const parsed = parseLatexFile(text);
			const entries: string[] = [];
			parsed.doc.forEach((n) => {
				if (n.type.name === 'list') entries.push(n.textContent);
			});
			expect(entries).toEqual(['D. Knuth. 1968.', 'L. Lamport. 1986.']);
			expect(serializeLatexFile(parsed, parsed.doc)).toBe(text);
		}
	});

	it('leaves an environment whose items take other arguments as a chip', () => {
		const text = file('\\begin{algorithmic}\n\\STATE $x \\gets 1$\n\\end{algorithmic}');
		const parsed = parseLatexFile(text);
		expect(parsed.doc.child(1).type.name).toBe('raw_latex');
	});
});
