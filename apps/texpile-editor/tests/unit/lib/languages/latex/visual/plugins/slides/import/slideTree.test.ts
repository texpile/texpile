import { describe, expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { find, parseDeck } from '../../../../slideDeck';

function kinds(node: Node): string[] {
	const out: string[] = [];
	node.forEach((child) => out.push(child.type.name));
	return out;
}

describe('a beamer deck', () => {
	it('reads frames, blocks, columns and overlays as slide nodes', async () => {
		const { parsed } = await parseDeck();
		const doc = parsed.doc;
		expect(() => doc.check()).not.toThrow();
		expect(kinds(doc)).toEqual(['frame', 'frame', 'frame']);

		// \frame{\titlepage} is the short form around the title page command
		const opening = doc.child(0);
		expect(opening.attrs.form).toBe('macro');
		expect(kinds(opening)).toEqual(['raw_latex']);

		// the title and subtitle are read from the body where \frametitle wrote them, and carry the form they came in
		const overlays = doc.child(1);
		expect(overlays.attrs.options).toBe('[t]');
		expect(kinds(overlays).slice(0, 2)).toEqual(['frame_title', 'frame_subtitle']);
		expect(overlays.child(0).attrs.form).toBe('macro');
		expect(overlays.child(0).textContent).toBe('Why overlays');

		// beamer's \only and \uncover wrap their text in a mark that keeps the command and its specification
		const marked: string[] = [];
		overlays.descendants((n) => {
			const mark = n.marks.find((m) => m.type.name === 'overlay');
			if (mark) marked.push(`${mark.attrs.command}${mark.attrs.spec}:${n.text}`);
		});
		expect(marked).toEqual(['only<2>:appears on slide two', 'uncover<3->:stays from three']);
		const items = find(overlays, 'list');
		expect(items.node.attrs.overlay).toBe('<1->');
		expect(items.node.textContent).toBe('First item');

		// the title and subtitle of the third frame are its arguments, the options what stands before them
		const code = doc.child(2);
		expect(code.attrs.options).toBe('<1-2>[fragile]');
		expect([code.child(0).attrs.form, code.child(1).attrs.form]).toEqual(['arg', 'arg']);
		const columns = find(code, 'columns').node;
		expect(columns.attrs.options).toBe('[T]');
		expect(columns.maybeChild(0)?.attrs).toMatchObject({ form: 'env', width: '0.4\\textwidth' });
		expect(columns.maybeChild(1)?.attrs).toMatchObject({ form: 'macro', width: '.6\\textwidth' });
		expect(columns.child(1).textContent).toBe('Right');
		const block = find(code, 'beamer_block').node;
		expect(block.attrs.kind).toBe('alertblock');
		expect(block.child(0).textContent).toBe('Careful');
	});

	it('leaves \\frame and a block of another kind alone outside a deck', () => {
		const article =
			'\\documentclass{article}\n\\begin{document}\nText \\frame{boxed} here.\n\n\\begin{block}{Name}\nBody.\n\\end{block}\n\\end{document}\n';
		const doc = parseLatexFile(article).doc;
		expect(kinds(doc)).toEqual(['paragraph', 'environment']);
	});
});
