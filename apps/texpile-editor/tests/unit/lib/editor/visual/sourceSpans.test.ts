import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { parseBodyOf, parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseCarryPlugin } from '$lib/editor/visual/parseCarry';
import {
	alignedSpans,
	charsOf,
	concatSpans,
	nearestPm,
	nearestSource,
	pmToSource,
	replaceKeepingSpans,
	sliceSpans,
	sourceToPm,
	spansOfChars,
	type Segment
} from '$lib/editor/visual/sourceSpans';
import { adoptParse, blockOriginOf, originsOf, parseOf, withoutOrigins, rememberParseMap } from '$lib/editor/visual/parseOrigins';

describe('leaf spans', () => {
	it('aligns a text against its bytes character by character', () => {
		expect(alignedSpans('a b', 10, 'a~b')).toEqual([
			{ from: 0, to: 1, srcFrom: 10, srcTo: 11, kind: 'text' },
			{ from: 1, to: 2, srcFrom: 11, srcTo: 12, kind: 'sub' },
			{ from: 2, to: 3, srcFrom: 12, srcTo: 13, kind: 'text' }
		]);
		expect(alignedSpans(' ', 5, '\n  ')).toEqual([{ from: 0, to: 1, srcFrom: 5, srcTo: 8, kind: 'sub' }]);
	});

	it('keeps the record through a replacement', () => {
		const r = replaceKeepingSpans('a---b', charsOf(5, [{ from: 0, to: 5, srcFrom: 0, srcTo: 5, kind: 'text' }]), '---', '—');
		expect(r.text).toBe('a—b');
		expect(spansOfChars(r.chars)).toEqual([
			{ from: 0, to: 1, srcFrom: 0, srcTo: 1, kind: 'text' },
			{ from: 1, to: 2, srcFrom: 1, srcTo: 4, kind: 'sub' },
			{ from: 2, to: 3, srcFrom: 4, srcTo: 5, kind: 'text' }
		]);
	});

	it('slices and joins', () => {
		const spans = [{ from: 0, to: 5, srcFrom: 0, srcTo: 5, kind: 'text' as const }];
		expect(sliceSpans('hello', spans, 2, 5)).toEqual([{ from: 0, to: 3, srcFrom: 2, srcTo: 5, kind: 'text' }]);
		expect(
			concatSpans([
				{ len: 2, spans: [{ from: 0, to: 2, srcFrom: 0, srcTo: 2, kind: 'text' }] },
				{ len: 3, spans: [{ from: 0, to: 3, srcFrom: 2, srcTo: 5, kind: 'text' }] }
			])
		).toEqual([{ from: 0, to: 5, srcFrom: 0, srcTo: 5, kind: 'text' }]);
	});
});

describe('lookups', () => {
	// "Hi \emph{there}." as a paragraph: the prose runs are the bytes, the markup between them is nobody's
	const spans: Segment[] = [
		{ pmFrom: 1, pmTo: 4, srcFrom: 0, srcTo: 3, kind: 'text' },
		{ pmFrom: 4, pmTo: 9, srcFrom: 9, srcTo: 14, kind: 'text' },
		{ pmFrom: 9, pmTo: 10, srcFrom: 15, srcTo: 16, kind: 'text' }
	];

	it('maps inside a run both ways', () => {
		expect(pmToSource(spans, 6)).toBe(11);
		expect(sourceToPm(spans, 11)).toBe(6);
	});

	it('has no answer for markup bytes and says so', () => {
		expect(sourceToPm(spans, 5)).toBeNull();
		expect(nearestPm(spans, 5, 1)).toBe(4);
		expect(nearestPm(spans, 5, -1)).toBe(4);
	});

	it('takes the side asked for at a shared boundary', () => {
		expect(pmToSource(spans, 4, -1)).toBe(3);
		expect(pmToSource(spans, 4, 1)).toBe(9);
	});

	it('inside a substituted run, the side asked for is the whole of it', () => {
		const sub: Segment[] = [{ pmFrom: 1, pmTo: 6, srcFrom: 0, srcTo: 6, kind: 'sub' }];
		expect(pmToSource(sub, 3, 1)).toBe(0);
		expect(pmToSource(sub, 3, -1)).toBe(6);
		expect(pmToSource(sub, 1, -1)).toBe(0);
		expect(pmToSource(sub, 6, 1)).toBe(6);
		expect(sourceToPm(sub, 2, 1)).toBe(1);
		expect(sourceToPm(sub, 2, -1)).toBe(6);
		expect(sourceToPm(sub, 6)).toBe(6);
	});

	it('reaches past unmapped positions to the nearest run', () => {
		expect(pmToSource(spans, 0)).toBeNull();
		expect(nearestSource(spans, 0, 1)).toBe(0);
		expect(nearestSource(spans, 0, -1)).toBe(0);
		expect(nearestSource(spans, 12, -1)).toBe(16);
		expect(nearestSource([], 3)).toBeNull();
	});
});

describe('parse origins', () => {
	const SRC = '\\documentclass{article}\n\\begin{document}\n\nAlpha one.\n\nBeta two.\n\nGamma three.\n\n\\end{document}\n';
	const parse = () => parseLatexFile(SRC);
	const retyped = (child: PMNode, text: string) => child.type.create(child.attrs, child.type.schema.text(text), child.marks);
	const fresh = (child: PMNode) => child.type.create(child.attrs, child.content, child.marks);
	const withChild = (doc: PMNode, i: number, child: PMNode) => {
		const kids: PMNode[] = [];
		doc.forEach((c, _o, k) => kids.push(k === i ? child : c));
		return doc.copy(Fragment.fromArray(kids));
	};

	it('knows every block of the parse by node, with its bytes, its gap and the tail', () => {
		const { doc, origins } = parse();
		expect(origins.origins.map((o) => o.text)).toEqual(['Alpha one.', 'Beta two.', 'Gamma three.']);
		expect(origins.origins.map((o) => o.pre)).toEqual(['\n\n', '\n\n', '\n\n']);
		expect(origins.tail).toBe('\n\n');
		expect(origins.verbatim).toBe(true);
		expect(originsOf(doc).origins.map((o) => o?.index)).toEqual([0, 1, 2]);
	});

	it('takes an equal node standing in the parse’s order for the parse’s own', () => {
		const { doc } = parse();
		const same = withChild(doc, 1, fresh(doc.child(1)));
		const { origins, was } = originsOf(same);
		expect(origins.map((o) => o?.index)).toEqual([0, 1, 2]);
		expect(was).toEqual([null, null, null]);
		expect(blockOriginOf(same.child(1))?.index).toBe(1);
	});

	it('tells a changed block by a leaf the edit left as it was, else by its place between known blocks', () => {
		const { doc } = parse();
		const edited = withChild(doc, 1, retyped(doc.child(1), 'Beta changed.'));
		const { origins, was } = originsOf(edited);
		expect(origins.map((o) => o?.index ?? null)).toEqual([0, null, 2]);
		expect(was[1]?.index).toBe(1);
		// two changed blocks in a row, one keeping a leaf of the parse: the other is placed after it
		const kept = doc.child(0).type.create(doc.child(0).attrs, [doc.child(0).firstChild!, doc.type.schema.text(' more')]);
		const both = withChild(withChild(doc, 0, kept), 1, retyped(doc.child(1), 'Beta changed.'));
		const twice = originsOf(both);
		expect(twice.origins.map((o) => o?.index ?? null)).toEqual([null, null, 2]);
		expect(twice.was.map((o) => o?.index ?? null)).toEqual([0, 1, null]);
	});

	it('leaves a block with no place in the parse unplaced', () => {
		const { doc } = parse();
		const kids: PMNode[] = [];
		doc.forEach((c) => kids.push(c));
		kids.splice(1, 0, retyped(doc.child(1), 'Inserted.'), retyped(doc.child(1), 'Also inserted.'));
		const { origins, was } = originsOf(doc.copy(Fragment.fromArray(kids)));
		expect(origins.map((o) => o?.index ?? null)).toEqual([0, null, null, 1, 2]);
		expect(was).toEqual([null, null, null, null, null]);
	});

	it('a document that forgot its bytes still knows its gaps, and never writes the bytes back', () => {
		const { doc } = parse();
		const forgot = withoutOrigins(doc);
		const { parse: p, origins } = originsOf(forgot);
		expect(p?.verbatim).toBe(false);
		expect(origins.map((o) => o?.index)).toEqual([0, 1, 2]);
		expect(origins[1]?.pre).toBe('\n\n');
	});

	it('does not place a block whose runs contradict its bytes, and says so', () => {
		const parsed = parse();
		const body = parseBodyOf(parsed, SRC);
		expect(parsed.origins.defects).toEqual([]);
		// a text run that is not its bytes: the block is written afresh, its neighbours keep theirs
		const beta = parsed.map.leaves.findIndex((l) => l.kind === 'text' && l.srcFrom === SRC.indexOf('Beta'));
		const moved = { ...parsed.map, leaves: parsed.map.leaves.map((l, i) => (i === beta ? { ...l, srcFrom: l.srcFrom + 1 } : l)) };
		const shifted = rememberParseMap(parsed.doc, moved, body);
		expect(shifted.defects.map((d) => d.kind)).toEqual(['mismatch']);
		expect(shifted.origins.map((o) => o.text)).toEqual(['Alpha one.', undefined, 'Gamma three.']);
		expect(shifted.origins.map((o) => o.pre)).toEqual(['\n\n', null, null]);
		expect(shifted.tail).toBe('\n\n');
		// a run reaching past its block: the block's span is short of its bytes, so it is not believed
		const last = parsed.map.leaves.length - 1;
		const long = { ...parsed.map, leaves: parsed.map.leaves.map((l, i) => (i === last ? { ...l, srcTo: l.srcTo + 3 } : l)) };
		const over = rememberParseMap(parsed.doc, long, body);
		expect(over.defects.map((d) => d.kind)).toEqual(['outside']);
		expect(over.origins.map((o) => o.text)).toEqual(['Alpha one.', 'Beta two.', undefined]);
		expect(over.tail).toBeNull();
	});

	it('hands the parse on to the documents an editor makes, and to a patched one on adoption', () => {
		const parsed = parse();
		const state = EditorState.create({ doc: parsed.doc, plugins: [parseCarryPlugin] });
		const typed = state.apply(state.tr.insertText(' typed', 8));
		expect(parseOf(typed.doc)).toBe(parsed.origins);
		const again = parse();
		adoptParse(typed.doc, again.origins);
		expect(parseOf(typed.doc)).toBe(again.origins);
	});
});
