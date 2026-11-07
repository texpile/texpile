// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Mark, Node as PMNode, Schema } from 'prosemirror-model';
import { Fragment } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { texpileClipboardParser, texpileClipboardSerializer } from '$lib/editor/paste/texpileCopy';

function throughClipboard(s: Schema, mark: Mark): Mark | undefined {
	const doc = s.topNodeType.createAndFill(null, s.nodes.paragraph.create(null, s.text('word', [mark])))!;
	const div = document.createElement('div');
	div.appendChild(texpileClipboardSerializer(s).serializeFragment(doc.content));
	let found: Mark | undefined;
	texpileClipboardParser(s)
		.parse(div)
		.descendants((n) => {
			if (n.isText) found = n.marks.find((m) => m.type === mark.type);
		});
	return found;
}

function nodesThroughClipboard(s: Schema, block: PMNode): PMNode {
	const div = document.createElement('div');
	div.appendChild(texpileClipboardSerializer(s).serializeFragment(Fragment.from(block)));
	return texpileClipboardParser(s).parse(div).firstChild!;
}

describe('a copy in the visual editor pasted back', () => {
	it('keeps the command a mark was written with', () => {
		expect(throughClipboard(schema, schema.marks.em.create({ cmd: 'emph' }))?.attrs.cmd).toBe('emph');
		const url = throughClipboard(schema, schema.marks.link.create({ href: 'http://x.org', bare: true }));
		expect(url?.attrs.bare).toBe(true);
		const typ = typSchema.marks.link.create({ href: 'http://x.org', typDest: '<intro>' });
		expect(throughClipboard(typSchema, typ)?.attrs).toEqual(typ.attrs);
	});

	it('keeps the attributes of a list and of a node', () => {
		const item = schema.nodes.list.create(
			{ kind: 'bullet', envName: 'thebibliography', envArgs: '{9}', envKey: 'knuth' },
			schema.nodes.paragraph.create(null, schema.text('D. Knuth'))
		);
		expect(nodesThroughClipboard(schema, item).attrs).toEqual(item.attrs);
		const heading = typSchema.nodes.heading.create({ level: 1, label: 'sec:intro' }, typSchema.text('Intro'));
		expect(nodesThroughClipboard(typSchema, heading).attrs).toEqual(heading.attrs);
	});

	it('leaves the file as it was when a theorem or a display formula is cut and pasted back', async () => {
		const { parseLatexFile, serializeLatexFile } = await import('$lib/workspace/latexRoundtrip');
		const tex =
			'\\documentclass{article}\n\\usepackage{amsthm}\n\\newtheorem{theorem}{Theorem}\n\\begin{document}\n\n' +
			'Before it.\n\n\\begin{theorem}[Named]\nTheorem body words.\n\\end{theorem}\n\n\\begin{equation}\n\\label{eq:a}\nE = mc^2\n\\end{equation}\n\nAfter it.\n\n\\end{document}\n';
		for (const type of ['environment', 'block_math']) {
			const p = parseLatexFile(tex);
			let at = -1;
			p.doc.forEach((n, pos) => {
				if (at < 0 && n.type.name === type) at = pos;
			});
			const block = p.doc.nodeAt(at)!;
			const pasted = nodesThroughClipboard(schema, block);
			const tr = new Transform(p.doc).replaceWith(at, at + block.nodeSize, pasted);
			expect(serializeLatexFile(p, tr.doc)).toBe(tex);
		}
	});
});
