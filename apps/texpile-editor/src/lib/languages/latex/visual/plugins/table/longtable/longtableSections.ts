import type { Node } from 'prosemirror-model';
import { LONGTABLE_MARKERS, type LongtableMarker } from './longtableMarkers';

export type RowSection = 'head' | 'foot' | 'body';

export type MarkerLine = {
	marker: LongtableMarker;
	before: number;
};

const MARKER_PATTERN = new RegExp(`\\\\(${LONGTABLE_MARKERS.join('|')})(?![a-zA-Z@])`, 'g');

function markersIn(rowEnd: unknown): LongtableMarker[] {
	return typeof rowEnd === 'string' ? [...rowEnd.matchAll(MARKER_PATTERN)].map((m) => m[1] as LongtableMarker) : [];
}

export function markerLinesOf(table: Node, caption: Node | null): MarkerLine[] {
	const lines: MarkerLine[] = [];
	const captionAt = caption && caption.attrs.rowAt != null ? Math.min(Number(caption.attrs.rowAt), table.childCount) : -1;
	function addCaptionLines() {
		for (const marker of markersIn(caption?.attrs.rowEnd)) lines.push({ marker, before: captionAt });
	}
	table.forEach((row, _offset, i) => {
		if (captionAt === i) addCaptionLines();
		for (const marker of markersIn(row.attrs.rowEnd)) lines.push({ marker, before: i + 1 });
	});
	if (captionAt === table.childCount) addCaptionLines();
	return lines;
}

export function sectionOfRow(lines: MarkerLine[], row: number): RowSection {
	const end = lines.find((l) => l.before > row);
	if (!end) return 'body';
	return end.marker === 'endfirsthead' || end.marker === 'endhead' ? 'head' : 'foot';
}
