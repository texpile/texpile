// Column widths surviving a save, in the one dialect that can express them.
//
// The bug this closes: dragging a column set `colwidth` on a cell, no serializer read it, and the
// next parse snapped the column back - while the document still marked itself dirty and "saved".
// Markdown and LaTeX now hide the handle instead (tableViewOnly); Typst writes real tracks.
//
// Widths become `fr`, snapped to quarter steps, because the editor lays tables out full width with
// fixed layout: a drag redistributes share, it does not choose a physical size. Snapping keeps the
// source a layout somebody can read rather than a record of where the mouse stopped.
//
// The px side lives in captureColumnWidths (it needs a measured table); what is exercised here is
// the pure half: the track model, and what the serializer does with widths once they exist.
import { describe, it, expect } from 'vitest';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { parseTracks, distribute, toFrTracks, snapFr } from '$lib/languages/typst/visual/serialize/tracks';
import { snapWidthToFr } from '$lib/editor/visual/extensions/table/snapWidth';
import type { Node } from 'prosemirror-model';

const PLAIN = '#table(\n  columns: 3,\n  [a], [b], [c],\n)\n';

/** the state the editor is in after a drag: every column carries a measured width. */
function withWidths(src: string, widths: (number | null)[]): Node {
	const doc = typstToProseMirror(src).doc;
	const rebuilt: Node[] = [];
	doc.forEach((block) => {
		if (block.type.name !== 'table') return void rebuilt.push(block);
		const rows: Node[] = [];
		block.forEach((row) => {
			const cells: Node[] = [];
			row.forEach((cell, _o, i) => {
				const w = widths[i];
				cells.push(w == null ? cell : cell.type.create({ ...cell.attrs, colwidth: [w] }, cell.content, cell.marks));
			});
			rows.push(row.type.create(row.attrs, cells, row.marks));
		});
		rebuilt.push(block.type.create(block.attrs, rows, block.marks));
	});
	return doc.type.create(doc.attrs, rebuilt, doc.marks);
}

/** the whole tuple, not just up to the first comma */
const columnsLine = (src: string) => /columns: (.+),$/m.exec(src)?.[1] ?? '';

describe('a dragged column reaches the file', () => {
	it('equal widths are 1fr each', () => {
		expect(columnsLine(serializeToTypst(withWidths(PLAIN, [120, 120, 120])))).toBe('(1fr, 1fr, 1fr)');
	});

	it('proportions survive, absolute pixels do not', () => {
		const out = columnsLine(serializeToTypst(withWidths(PLAIN, [240, 120, 120])));
		expect(out).toBe('(1.5fr, 0.75fr, 0.75fr)');
		// the same shape measured in a wider pane must produce the same source
		expect(columnsLine(serializeToTypst(withWidths(PLAIN, [480, 240, 240])))).toBe(out);
	});

	it('a column nobody sized stays auto', () => {
		expect(columnsLine(serializeToTypst(withWidths(PLAIN, [200, null, 100])))).toBe('(1.25fr, auto, 0.75fr)');
	});

	it('an untouched table keeps its colspec byte for byte', () => {
		expect(roundtripOf(PLAIN)).toBe(PLAIN);
		const tuple = '#table(\n  columns: (auto, 1fr),\n  [a], [b],\n)\n';
		expect(roundtripOf(tuple)).toBe(tuple);
		const sized = '#table(\n  columns: (1.5fr, 0.75fr, 0.75fr),\n  [a], [b], [c],\n)\n';
		expect(roundtripOf(sized)).toBe(sized);
	});
});

function roundtripOf(src: string): string {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc);
}

describe('widths snap to quarter-fr steps', () => {
	it('rounds to the nearest step', () => {
		expect(snapFr(1.06)).toBe(1);
		expect(snapFr(1.2)).toBe(1.25);
		expect(snapFr(1.4)).toBe(1.5);
	});

	it('never collapses a column to nothing', () => {
		expect(snapFr(0.01)).toBe(0.25);
		expect(snapFr(0)).toBe(0.25);
	});

	it('a nudge too small to be a step does not change the file', () => {
		const before = columnsLine(serializeToTypst(withWidths(PLAIN, [120, 120, 120])));
		const nudged = columnsLine(serializeToTypst(withWidths(PLAIN, [126, 118, 116])));
		expect(nudged).toBe(before);
	});

	it('emits fr values that read as a layout', () => {
		expect(toFrTracks([300, 100, 100])).toBe('(1.75fr, 0.5fr, 0.5fr)');
		expect(toFrTracks([null, null])).toBeNull();
	});
});

describe('tracks resolve to pixels against a measured table', () => {
	const widthsFor = (spec: string, cols: number, total: number) => distribute(parseTracks(spec, cols)!, total);

	it('fr tracks split the available width in proportion', () => {
		expect(widthsFor('(2fr, 1fr, 1fr)', 3, 800)).toEqual([400, 200, 200]);
	});

	it('the total is spent exactly, so the table cannot overflow its container', () => {
		// 1000 does not divide by 3; the residue has to land somewhere rather than be dropped
		const w = widthsFor('(1fr, 1fr, 1fr)', 3, 1000);
		expect(w.reduce((a: number, b) => a + (b ?? 0), 0)).toBe(1000);
	});

	it('absolute tracks take their own width and fr shares the rest', () => {
		expect(widthsFor('(96pt, 1fr, 1fr)', 3, 800)).toEqual([128, 336, 336]);
	});

	it('auto tracks stay unsized so the browser fits them to content', () => {
		expect(widthsFor('(auto, 1fr)', 2, 600)).toEqual([null, 600]);
	});

	it('a plain count is all-auto', () => {
		expect(widthsFor('3', 3, 900)).toEqual([null, null, null]);
	});

	it('a spec that cannot describe the grid is stale, not a baseline', () => {
		expect(parseTracks('(auto, 1fr)', 3)).toBeNull();
		expect(parseTracks('2', 3)).toBeNull();
	});
});

describe('the width survives repeated saves', () => {
	it('reaches a fixed point instead of drifting', () => {
		const once = serializeToTypst(withWidths(PLAIN, [240, 120, 120]));
		const twice = serializeToTypst(typstToProseMirror(once).doc);
		expect(twice).toBe(once);
		expect(serializeToTypst(typstToProseMirror(twice).doc)).toBe(once);
	});

	it('a resized table that is then edited keeps its tracks', () => {
		const resized = serializeToTypst(withWidths(PLAIN, [240, 120, 120]));
		expect(columnsLine(resized)).toBe('(1.5fr, 0.75fr, 0.75fr)');
		expect(columnsLine(serializeToTypst(typstToProseMirror(resized).doc))).toBe('(1.5fr, 0.75fr, 0.75fr)');
	});
});

describe('the detent a drag lands on', () => {
	// snapWidthToFr is the one piece of the resize that is pure: given the table's width and column
	// count it decides where a dragged edge may stop. The measuring and the drag around it need a
	// browser, but this does not.
	const wide = { tableWidth: 900, columns: 3 }; // step = 900 * 0.25 / 3 = 75px

	it('lands on multiples of a quarter-fr', () => {
		expect(snapWidthToFr(300, wide)).toBe(300);
		expect(snapWidthToFr(310, wide)).toBe(300);
		expect(snapWidthToFr(340, wide)).toBe(375);
	});

	it('a nudge under half a step does not move the column', () => {
		const base = snapWidthToFr(300, wide);
		for (const nudge of [-30, -10, 0, 10, 30]) expect(snapWidthToFr(300 + nudge, wide)).toBe(base);
	});

	it('never returns less than one step, so a column cannot be dragged away', () => {
		expect(snapWidthToFr(0, wide)).toBe(75);
		expect(snapWidthToFr(-500, wide)).toBe(75);
	});

	it('the step scales with the table, so the feel does not change with the pane', () => {
		// same proportion of a table twice as wide is the same number of detents in
		const narrow = { tableWidth: 450, columns: 3 };
		expect(snapWidthToFr(300, wide) / wide.tableWidth).toBe(snapWidthToFr(150, narrow) / narrow.tableWidth);
	});

	it('more columns means finer steps', () => {
		expect(snapWidthToFr(100, { tableWidth: 800, columns: 2 })).toBe(100); // step 100
		expect(snapWidthToFr(100, { tableWidth: 800, columns: 8 })).toBe(100); // step 25
		expect(snapWidthToFr(110, { tableWidth: 800, columns: 2 })).toBe(100);
		expect(snapWidthToFr(110, { tableWidth: 800, columns: 8 })).toBe(100);
		expect(snapWidthToFr(115, { tableWidth: 800, columns: 8 })).toBe(125);
	});

	it('degrades to the raw width rather than dividing by zero', () => {
		expect(snapWidthToFr(200, { tableWidth: 0, columns: 3 })).toBe(200);
	});
});
