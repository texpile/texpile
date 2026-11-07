import { describe, expect, it } from 'vitest';
import { Transform } from 'prosemirror-transform';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { adoptParse, containerOriginsOf, withoutOrigins } from '$lib/editor/visual/parseOrigins';
import { DECK, endOf, find, parseDeck, reparse } from '../../../../slideDeck';

/** the lines of `after` that are not the lines of `before` at the same place, from both ends */
function changedLines(before: string, after: string): string[] {
	const a = before.split('\n');
	const b = after.split('\n');
	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head]) head++;
	let tail = 0;
	while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
	return b.slice(head, b.length - tail);
}

describe('a beamer deck written back', () => {
	it('saves untouched as it was, and an edit to a title changes that line only', async () => {
		const deck = await parseDeck();
		expect(serializeLatexFile(deck.parsed, deck.parsed.doc)).toBe(DECK);

		// the title the file wrote as \frametitle stays one, the one it wrote as an argument stays an argument
		const typed = (needle: string) => {
			const tr = new Transform(deck.parsed.doc);
			const at = endOf(deck.parsed.doc, needle);
			// as typing does, in the marks around the caret
			tr.insert(at, schema.text('!', tr.doc.resolve(at).marks()));
			return serializeLatexFile(deck.parsed, tr.doc);
		};
		expect(changedLines(DECK, typed('Why overlays'))).toEqual(['  \\frametitle{Why overlays!}']);
		expect(changedLines(DECK, typed('Code'))).toEqual(['\\begin{frame}<1-2>[fragile]{Code!}{Listing}']);
		expect(changedLines(DECK, typed('Careful'))).toEqual(['  \\begin{alertblock}{Careful!}']);
		expect(changedLines(DECK, typed('appears on slide'))).toEqual([
			'  Some text \\only<2>{appears on slide! two} and \\uncover<3->{stays from three}.'
		]);
	});

	it('writes every part afresh in the form it was read', async () => {
		const deck = await parseDeck();
		const fresh = serializeLatexFile(deck.parsed, withoutOrigins(deck.parsed.doc));
		expect(fresh).toContain('\\frame{\\titlepage}');
		expect(fresh).toContain('\\begin{frame}[t]\n\\frametitle{Why overlays}\n\\framesubtitle{They reveal}');
		expect(fresh).toContain('Some text \\only<2>{appears on slide two} and \\uncover<3->{stays from three}. \\pause After the pause.');
		expect(fresh).toContain('\\item<1-> First item\n\\item<2-3> Second item');
		expect(fresh).toContain('\\begin{frame}<1-2>[fragile]{Code}{Listing}');
		expect(fresh).toContain('\\begin{column}{0.4\\textwidth}\nLeft\n\\end{column}\n\\column{.6\\textwidth}\nRight\n\\end{columns}');
		// and what it wrote reads back as the same deck, written the same again
		const again = reparse(deck, fresh);
		expect(serializeLatexFile(again, again.doc)).toBe(fresh);
	});

	it('changing a frame option leaves the body of the slide as the file wrote it', async () => {
		const deck = await parseDeck();
		const { node, pos } = find(deck.parsed.doc, 'frame', 1);
		const tr = new Transform(deck.parsed.doc);
		tr.setNodeMarkup(pos, undefined, { ...node.attrs, options: '[t,fragile]' });
		// what the frame view does as it dispatches the change
		adoptParse(tr.doc.nodeAt(pos)!, containerOriginsOf(node)!);
		const out = serializeLatexFile(deck.parsed, tr.doc);
		expect(out).toContain('\\begin{frame}[t,fragile]');
		expect(out).toContain(
			'  Some text \\only<2>{appears on slide two} and \\uncover<3->{stays from three}.\n  \\pause\n  After the pause.'
		);
		expect(out).toContain('    \\item<1-> First item\n    \\item<2-3> Second item\n  \\end{itemize}');
	});

	it('writes a title added to a frame that had none into its opening line', async () => {
		const deck = await parseDeck(
			'\\documentclass{beamer}\n\\begin{document}\n\n\\begin{frame}\n  Body words.\n\\end{frame}\n\n\\end{document}\n'
		);
		const { node, pos } = find(deck.parsed.doc, 'frame');
		const tr = new Transform(deck.parsed.doc);
		tr.insert(pos + 1, schema.nodes.frame_title.create({ form: 'arg' }, schema.text('Fresh')));
		adoptParse(tr.doc.nodeAt(pos)!, containerOriginsOf(node)!);
		expect(serializeLatexFile(deck.parsed, tr.doc)).toContain('\\begin{frame}{Fresh}\n');
		expect(serializeLatexFile(deck.parsed, tr.doc)).toContain('Body words.\n\\end{frame}');
	});
	it('reads a title after a comment on the opening line, and a title added as a line keeps that comment', async () => {
		const text =
			'\\documentclass{beamer}\n\\begin{document}\n\n\\begin{frame}[fragile] % fragile for the verbatim\n    \\frametitle{Citation}\n    Words.\\\\~\n\\end{frame}\n\n\\begin{frame}[fragile] % no title yet\n    Body.\\\\~\n\\end{frame}\n\n\\end{document}\n';
		const deck = await parseDeck(text);
		expect(find(deck.parsed.doc, 'frame_title').node.textContent).toBe('Citation');
		const { node, pos } = find(deck.parsed.doc, 'frame', 1);
		const tr = new Transform(deck.parsed.doc);
		tr.insert(pos + 1, schema.nodes.frame_title.create({ form: 'macro' }, schema.text('Fresh')));
		adoptParse(tr.doc.nodeAt(pos)!, containerOriginsOf(node)!);
		expect(changedLines(text, serializeLatexFile(deck.parsed, tr.doc))).toEqual(['    \\frametitle{Fresh}', '']);
	});
	it('a paragraph added to a titled frame leaves the lines the frame had', async () => {
		const text =
			'\\documentclass{beamer}\n\\begin{document}\n\n\\begin{frame}{First}\n  Some words.\n  \\pause\n  More after pause.\n\\end{frame}\n\n\\end{document}\n';
		const deck = await parseDeck(text);
		const at = endOf(deck.parsed.doc, 'More after pause.');
		const tr = new Transform(deck.parsed.doc);
		tr.split(at);
		tr.insert(tr.mapping.map(at) + 1, schema.text('Next.'));
		expect(changedLines(text, serializeLatexFile(deck.parsed, tr.doc))).toEqual(['', '  Next.']);
	});
});
