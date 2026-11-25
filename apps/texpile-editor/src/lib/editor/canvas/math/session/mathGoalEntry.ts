// a formula entered by Up or Down: on its top or bottom row, at the caret stop nearest the goal x (A5)
import { mathfieldContext } from 'mathlive';
import type { CanvasMathSession } from './mathSession';

/** the caret placed and its offset; a formula that is one array (Typst's aligned rows) is entered on its first or last row */
export function enterAtGoal(session: CanvasMathSession, dir: -1 | 1, goalX: number): number {
	const { field, geometry } = session;
	field.executeCommand(dir > 0 ? 'moveToMathfieldStart' : 'moveToMathfieldEnd');
	const inner = dir > 0 ? 1 : field.lastOffset - 1;
	const edge = field.position;
	field.position = inner;
	const rows = inner > 0 && inner < field.lastOffset && !!mathfieldContext(field).array;
	if (!rows) field.position = edge;
	const place = geometry.place();
	const row = session.layout.caret?.baseline;
	if (!place || row === undefined) return field.position;
	// MathLive answers a point beside the formula with its start or end, whatever the row
	const x = rows ? Math.min(place.rect.x + place.rect.width - 1, Math.max(place.rect.x + 1, goalX)) : goalX;
	const client = session.view.canvas.clientRect({ x, y: place.baseline + row * place.size, width: 0, height: 0 });
	const offset = field.getOffsetFromPoint(client.left, client.top, { bias: 0 });
	if (offset >= 0) field.position = offset;
	moveToNearestStopOnRow(session, goalX);
	return field.position;
}

/** MathLive's point rule weighs atom boxes; the caret goes on to the caret stop of its row nearest x, as a vertical move does */
function moveToNearestStopOnRow(session: CanvasMathSession, x: number): void {
	const { field, geometry } = session;
	function stop(offset: number) {
		field.position = offset;
		const box = geometry.caretBox();
		return box && { offset, row: session.layout.caret!.baseline, distance: Math.abs(box.x - x) };
	}
	let best = stop(field.position);
	for (const dir of [-1, 1]) {
		for (
			let next = best && stop(best.offset + dir);
			best && next && next.row === best.row && next.distance < best.distance;
			next = stop(next.offset + dir)
		)
			best = next;
	}
	if (best) field.position = best.offset;
}
