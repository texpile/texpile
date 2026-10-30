import { connectorEnds } from '../../connectors/connectorTargets';
import { arrowEnds } from '../../diagrams/arrowEnds';
import { bendHandleAt } from '../gesture/drags/bendDrag';
import { canvasPoint, type Point } from '../../figure/geometry';
import type { FigureEditorState } from '../editorState.svelte';

export type SelectionHandle = { key: string; at: Point };

/** the selected path's points and radii, where the canvas puts a handle on each; a connector's ends are `e0` and `e1` */
export function selectionHandles(ed: FigureEditorState): SelectionHandle[] {
	const st = ed.selectedStatement;
	const c = ed.selectedConnector;
	if (st && ed.flags.lockedAll.has(st.i)) return [];
	if (st?.kind === 'arrow' && ed.selection.length === 1) return arrowEnds(ed, st);
	if (!st || (st.kind !== 'path' && st.kind !== 'plot') || ed.selection.length > 1) return [];
	const text = ed.preview ?? ed.source;
	const picture = ed.preview === null ? ed.picture : ed.language.readPicture(text, ed.shownIndex);
	const own = picture?.statements.find((s) => s.i === st.i);
	if (!own || !picture) return [];
	// the `\coordinate`s it is drawn through, which draw nothing to pick
	const named = ed.language.namedPoints(text, picture, own).points.flatMap((p) => {
		const at = ed.language.pathPoints(text, p).find((q) => !q.relative);
		return at ? [{ key: `c${p.i}`, at: canvasPoint(at.x, at.y, ed.render.transformOf(p.i)) }] : [];
	});
	if (!ed.selectedInfo?.movable && !c) return named;
	const m = ed.render.transformOf(st.i);
	let points: SelectionHandle[] = ed.language.pathPoints(text, own).map((p, k) => ({ key: `p${k}`, at: canvasPoint(p.x, p.y, m) }));
	// a loop has both ends on one node, where they would only be in the way
	const loop = !!c && !!c.connector.ends[0].node && c.connector.ends[0].node === c.connector.ends[1].node;
	const ends = c && !loop && ed.drawingMatchesText ? connectorEnds(ed, text, own, c.connector) : null;
	if (c && ends) {
		// a plain end is the first or last point, and its handle is the end's
		const dropped = [c.connector.ends[0].node ? null : points[0]?.key, c.connector.ends[1].node ? null : points.at(-1)?.key];
		points = [...points.filter((p) => !dropped.includes(p.key)), { key: 'e0', at: ends[0] }, { key: 'e1', at: ends[1] }];
		// the middle of a straight or bent one pulls it into a bend, as Excalidraw's does
		const { route, bend } = c.connector;
		const degrees = route === 'bend left' ? (bend ?? 30) : route === 'bend right' ? -(bend ?? 30) : route === 'straight' ? 0 : null;
		if (degrees !== null && !ed.picture?.layout) points.push({ key: 'k', at: bendHandleAt(ends, degrees) });
	}
	const rims = ed.language.radii(text, own).map((r, k) => ({
		key: `r${k}`,
		at: canvasPoint(r.center.x + (r.axis === 'y' ? 0 : r.value), r.center.y + (r.axis === 'y' ? r.value : 0), m)
	}));
	return [...points, ...rims, ...named];
}
