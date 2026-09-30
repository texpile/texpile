// Content the editor creates has no source slice to fall back on: what the serializer writes
// must read back as the same document. Each case here used to change meaning on reload
// (findings T2, T3, T11, T15, T21 of the 2026-09-05 hunt).
import { describe, it, expect } from 'vitest';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typSchema } from '$lib/languages/typst/visual/schema';
import type { Node } from 'prosemirror-model';

const n = typSchema.nodes;
const m = typSchema.marks;
const text = (s: string, marks: string[] = []) =>
	typSchema.text(
		s,
		marks.map((name) => m[name].create())
	);
const para = (...content: Node[]) => n.paragraph.create(null, content);
const doc = (...blocks: Node[]) => n.doc.create(null, blocks);
const out = (...blocks: Node[]) => serializeToTypst(doc(...blocks));

/** the inline nodes of the first paragraph after a reparse, as [type or mark names, text] */
function reread(src: string): [string, string][] {
	const items: [string, string][] = [];
	typstToProseMirror(src)
		.doc.child(0)
		.forEach((c) => {
			items.push([
				c.isText ? c.marks.map((x) => x.type.name).join('+') : c.type.name,
				c.isText ? (c.text ?? '') : String(c.attrs.target ?? '')
			]);
		});
	return items;
}

describe('references (T2)', () => {
	it('text typed right after a ref does not extend its target', () => {
		const src = out(para(n.typ_ref.create({ target: 'k' }), text('s')));
		expect(src).toBe('#ref(<k>)s');
		expect(reread(src)).toEqual([
			['typ_ref', 'k'],
			['', 's']
		]);
	});

	it('an emphasised ref keeps its delimiters outside the marker', () => {
		const ref = n.typ_ref.create({ target: 'h' }).mark([m.em.create()]);
		expect(out(para(ref))).toBe('_#ref(<h>)_');
		expect(reread('_#ref(<h>)_')).toEqual([['typ_ref', 'h']]);
	});
});

describe('emphasis delimiters beside a reference, a url or a code chip', () => {
	const chip = (s: string, marks: string[] = []) =>
		n.inline_latex.create(
			{ lang: 'typst' },
			typSchema.text(s),
			marks.map((name) => m[name].create())
		);
	const back = (src: string) =>
		typstToProseMirror(src + '\n')
			.doc.child(0)
			.toJSON();

	it('a space ending the emphasis stays inside it where the delimiter would go on as more of what the space follows', () => {
		const atoms: [Node, string][] = [
			[n.typ_ref.create({ target: 'knuth' }).mark([m.em.create()]), '@knuth'],
			[chip('https://x.org/a', ['em']), 'https://x.org/a'],
			[chip('#sym.alpha', ['em']), '#sym.alpha']
		];
		for (const [atom, written] of atoms) {
			const p = para(text('see ', ['em']), atom, text(' ', ['em']), text(' now.'));
			const src = out(p);
			expect(src).toBe(`_see ${written} _ now.`);
			expect(back(src)).toEqual(p.toJSON());
		}
	});

	it('an emphasis ending or starting against a code chip takes the function form', () => {
		const ends = para(text('the angle '), text('is ', ['em']), chip('#sym.alpha', ['em']), text(' here.'));
		expect(out(ends)).toBe('the angle #emph[is #sym.alpha] here.');
		expect(back(out(ends))).toEqual(ends.toJSON());
		const starts = para(text('a '), chip('#sym.alpha'), text('(x)', ['em']));
		expect(out(starts)).toBe('a #sym.alpha#emph[(x)]');
		expect(back(out(starts))).toEqual(starts.toJSON());
		// a star does not go on with a code expression, and nothing goes on past a call's parenthesis
		expect(out(para(text('is ', ['strong']), chip('#sym.alpha', ['strong'])))).toBe('*is #sym.alpha*');
		expect(out(para(chip('#f(x)', ['em'])))).toBe('_#f(x)_');
	});
});

describe('inline raw (T3)', () => {
	it('inline code holding a backtick takes the function form', () => {
		const src = out(para(text('a`b', ['code'])));
		expect(src).toBe('#raw("a`b")');
		expect(reread(src)).toEqual([['code', 'a`b']]);
	});
});

describe('line-start markers inside brackets (T11)', () => {
	it('a marker at the start of a cell, a caption or a mark body is escaped', () => {
		const cell = n.table_cell.create(null, para(text('- a')));
		const table = n.table.create(null, n.table_row.create(null, cell));
		expect(out(table)).toContain('[\\- a]');
		expect(out(para(text('= y', ['u'])))).toBe('#underline[\\= y]');
		expect(reread('#underline[\\= y]')).toEqual([['u', '= y']]);
		const term = n.term_item.create(null, [n.term_title.create(null, text('a: b')), para(text('desc'))]);
		expect(out(term)).toBe('/ a\\: b: desc');
	});

	it('a cell ending in a line break or a line comment has its closing bracket on the next line', () => {
		const note = n.inline_latex.create({ lang: 'typst' }, typSchema.text('// note'));
		const ends = [[para(), para(text('1'), n.hard_break.create({ lineBreak: true }))], [para(text('x '), note)]];
		for (const content of ends) {
			const row = n.table_row.create(null, [n.table_cell.create(null, content), n.table_cell.create(null, para(text('z')))]);
			const src = out(n.table.create(null, row));
			expect(src).toContain('\n], [z]');
			const back = typstToProseMirror(src + '\n').doc.child(0);
			expect(back.type.name).toBe('table');
			expect(back.child(0).childCount).toBe(2);
		}
	});
});

describe('intraword emphasis (T15)', () => {
	it('bold on part of a word takes the function form, which typst reads back as strong', () => {
		const src = out(para(text('un'), text('happy', ['strong']), text('ness')));
		expect(src).toBe('un#strong[happy]ness');
		expect(reread(src)).toEqual([
			['', 'un'],
			['strong', 'happy'],
			['', 'ness']
		]);
	});
});

describe('small editor-created drifts (T21)', () => {
	it('a header row below the first row is written as table.header', () => {
		const body = n.table_row.create(null, [n.table_cell.create(null, para(text('a'))), n.table_cell.create(null, para(text('b')))]);
		const head = n.table_row.create(null, [n.table_header.create(null, para(text('c'))), n.table_header.create(null, para(text('d')))]);
		const src = out(n.table.create(null, [body, head]));
		expect(src).toBe('#table(\n  columns: 2,\n  [a], [b],\n  table.header([c], [d]),\n)');
		const back = typstToProseMirror(src + '\n').doc.child(0);
		expect(back.type.name).toBe('table');
		expect(back.child(1).child(0).type.name).toBe('table_header');
	});

	it('the dash and ellipsis characters go out as the shorthand typst sources write them', () => {
		expect(out(para(text('a \u2014 b \u2013 c\u2026 d')))).toBe('a --- b -- c... d');
		const back = typstToProseMirror('a --- b -- c... d\n').doc.child(0);
		expect(back.textContent).toBe('a \u2014 b \u2013 c\u2026 d');
	});

	it('a dash or ellipsis next to a hyphen or a dot stays the character, not a shorthand that would fuse', () => {
		expect(out(para(text('x-\u2013y \u2026. z')))).toBe('x-\u2013y \u2026. z');
		expect(typstToProseMirror('x-\u2013y \u2026. z\n').doc.child(0).textContent).toBe('x-\u2013y \u2026. z');
	});

	it('emphasis over whitespace only emits no delimiters', () => {
		expect(out(para(text('a'), text(' ', ['em']), text('b')))).toBe('a b');
	});

	it('a space typed after a hard break survives', () => {
		const src = out(para(text('a'), n.hard_break.create({ lineBreak: true }), text(' b')));
		expect(typstToProseMirror(src + '\n').doc.child(0).textContent).toBe('a b');
	});

	it('text running straight on from a coloured word does not read as more of the call', () => {
		const src = out(para(text('and '), text('coloured', ['textcolor']), text('.term (x) [y]')));
		expect(src).toBe('and #text(fill: black)[coloured]\\.term (x) \\[y\\]');
		expect(reread(src + '\n')).toEqual([
			['', 'and '],
			['textcolor', 'coloured'],
			['', '.term (x) [y]']
		]);
		expect(out(para(text('and '), text('coloured', ['textcolor']), text('(x)')))).toBe('and #text(fill: black)[coloured]\\(x)');
	});

	it('an unnumbered heading has a typst form', () => {
		const src = out(n.heading.create({ level: 2, numbered: false }, text('Intro')));
		expect(src).toBe('#heading(level: 2, numbering: none)[Intro]');
		const back = typstToProseMirror(src + '\n').doc.child(0);
		expect(back.type.name).toBe('heading');
		expect(back.attrs.numbered).toBe(false);
	});
});
